"""Peptide adviser chat — intake questionnaire, RAG recommendations, and follow-up."""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Any, List, Optional

from fastapi import HTTPException
from openai import OpenAI

from config import settings
from models.chat import ChatMessage, FollowUpRequest, IntakeRequest, Source
from services.routes.chat.chroma_client import get_chroma_client
from services.routes.chat.embed import build_embedding_function
from services.routes.chat.memory import trim_chat_history
from services.routes.chat.questionnaire import (
    build_rag_query,
    build_recommendation_board,
    evaluate_intake,
    get_flow_definition,
)

logger = logging.getLogger(__name__)

INTAKE_SYSTEM = """You are Frontier BioMed's Peptide Recommendation assistant for licensed providers.

Output a SHORT Recommendation Card in markdown. Hard limits:
- Max ~180 words total
- Use only these headings: ### Shortlist · ### Safety · ### Labs · ### Note
- Shortlist: 2–4 peptides as bullets. Each bullet = **Name** — 1 short reason (≤18 words).
- Safety: bullets only from evaluation hard_stops/cautions (skip empty).
- Labs: ≤5 bullets from evaluation.
- Note: one sentence regulatory reminder.

RULES:
- Never prescribe doses or tell the provider to start therapy.
- Never recommend blocked/excluded peptides.
- Prefer evaluation rankings; KB only for brief mechanism/caution.
- No long paragraphs, no tables, no filler.
"""

FOLLOWUP_SYSTEM = """You are Frontier BioMed's Peptide Adviser in a live chat after the Recommendation Card.

The BOARD is the whole case. Apply its ranking technique and each peptide's mechanism, why it fits, advantages, and watch-outs across the full shortlist. Do not narrow the answer to one peptide unless the provider names one.

Return JSON only, with no markdown fence:
{"answer":"...","suggested_questions":["...","..."]}

answer:
- Concise markdown that answers only the latest message
- Greeting (hi, hello, how are you): 1–2 sentences that return the greeting. Do not discuss peptides
- Farewell (bye, thanks, that's all): a short goodbye. Do not discuss peptides
- If they ask for a table, list, comparison, or another format, use that markdown form
- Clinical questions: answer that question from the board. Bold peptide names as **Name**. Max ~80 words
- If the message names one peptide or asks for its details, answer only that peptide: why it fits this case, how it works, advantages, and watch-outs. Do not review the other peptides
- Off-topic questions: one relevant sentence, then offer to return to the case
- Never prescribe doses or tell the provider to start therapy
- Never suggest blocked peptides

suggested_questions:
- Exactly 2 or 3 questions that continue the latest message
- Each question is 3 to 6 words and ends with ?
- After a greeting, suggest greeting-style questions
- After a farewell, suggest closing questions
- After a clinical question, suggest the next questions on that same topic
"""

_state: dict = {}
_init_lock = threading.Lock()


def ensure_initialized() -> None:
    """Lazy init for Chroma collection and OpenRouter LLM client."""
    if _state.get("collection") and _state.get("llm"):
        return

    with _init_lock:
        if _state.get("collection") and _state.get("llm"):
            return

        missing = [
            name
            for name, value in {
                "OPENROUTER_API_KEY": settings.openrouter_api_key,
                "CHROMA_API_KEY": settings.chroma_api_key,
                "CHROMA_TENANT": settings.chroma_tenant,
            }.items()
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing env vars: {missing}. Check .env")

        _state["llm"] = OpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            timeout=45.0,
            max_retries=1,
        )

        client = get_chroma_client()
        embed_fn = build_embedding_function()
        _state["collection"] = client.get_or_create_collection(
            name=settings.chroma_collection,
            embedding_function=embed_fn,
            metadata={"hnsw:space": "cosine"},
        )


def get_api_info() -> dict:
    return {
        "name": "Frontier BioMed Peptide Intake",
        "status": "ok",
        "collection": settings.chroma_collection,
        "chat_model": settings.chat_model,
        "chat_model_followup": settings.chat_model_followup,
        "embed_model": settings.embed_model,
        "flow_version": "1.0",
    }


def get_health() -> dict:
    try:
        ensure_initialized()
        count = _state["collection"].count()
        return {"ok": True, "vectors": count}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def get_questionnaire_flow() -> dict:
    ensure_initialized()
    return get_flow_definition()


def evaluate_questionnaire(req: IntakeRequest) -> dict:
    ensure_initialized()
    return evaluate_intake(req.answers)


def recommend_questionnaire(req: IntakeRequest) -> dict:
    ensure_initialized()
    evaluation = evaluate_intake(req.answers)
    safety = evaluation.get("safety", {})

    if safety.get("intake_blocked"):
        return {
            "evaluation": evaluation,
            "answer": (
                "### Intake stopped\n\n"
                + "\n".join(f"- {s}" for s in safety.get("hard_stops", []))
                + f"\n\n*{evaluation.get('disclaimer', '')}*"
            ),
            "sources": [],
        }

    k = req.top_k or settings.top_k
    rag_q = build_rag_query(evaluation, req.answers)
    context, sources = _retrieve(rag_q, k)
    if not context.strip():
        context = "(Limited KB hits — rely on deterministic evaluation.)"

    try:
        answer = _generate_intake_recommendation(req.answers, evaluation, context)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc

    return {
        "evaluation": evaluation,
        "answer": answer,
        "sources": [source.model_dump() for source in sources],
    }


def followup_questionnaire(req: FollowUpRequest, *, board: Optional[dict] = None) -> dict:
    ensure_initialized()
    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Empty question.")

    social = _social_reply(question)
    if social:
        return {
            "answer": social["answer"],
            "sources": [],
            "suggested_questions": social["suggested_questions"],
        }

    # Skip RAG for ultra-short meta questions — evaluation context is enough.
    needs_rag = _question_needs_rag(question)
    sources: List[Source] = []
    context = ""
    if needs_rag:
        k = min(req.top_k or settings.top_k, settings.top_k)
        rag_q = f"{question}. Patient goal: {req.evaluation.get('primary_goal', '')}. "
        recs = req.evaluation.get("recommendations") or []
        peptide_names = [p.get("name", "") for p in recs[:4] if p.get("name")]
        if peptide_names:
            rag_q += "Peptides: " + ", ".join(peptide_names)
        context, sources = _retrieve(rag_q, k)
        if not context.strip():
            context = "(No additional KB context.)"

    try:
        raw = _generate_followup(
            req.answers,
            req.evaluation,
            req.recommendation,
            req.messages,
            question,
            context,
            board=board,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc

    answer, questions = _parse_followup_payload(raw)
    if len(questions) < 2:
        for fallback in _fallback_questions(board):
            if fallback not in questions:
                questions.append(fallback)
            if len(questions) >= 3:
                break

    return {
        "answer": answer,
        "sources": [source.model_dump() for source in sources],
        "suggested_questions": questions[:3],
    }


async def recommend_for_patient(
    *,
    user_id: str,
    patient_id: str,
    top_k: Optional[int] = None,
) -> dict:
    from services.routes.chat import patient_service

    patient = await patient_service.get_patient(user_id=user_id, patient_id=patient_id)
    answers = patient.get("intake_answers") or {}
    if not answers:
        raise HTTPException(status_code=400, detail="Submit intake answers before requesting a recommendation.")

    req = IntakeRequest(answers=answers, top_k=top_k)
    result = recommend_questionnaire(req)
    board = build_recommendation_board(result["evaluation"], confidence="balanced")
    await patient_service.save_patient_recommendation(
        user_id=user_id,
        patient_id=patient_id,
        answers=answers,
        evaluation=result["evaluation"],
        recommendation=result["answer"],
        sources=result.get("sources") or [],
        recommendation_board=board,
    )
    logger.info("Recommendation saved for patient %s user %s", patient_id, user_id)
    try:
        from services.notification import events as notify_events

        notify_events.student_recommendation_ready(
            user_id=user_id,
            patient_name=str(patient.get("display_name") or "Patient"),
        )
    except Exception:
        logger.exception("Failed to queue recommendation notification user=%s patient=%s", user_id, patient_id)
    return await patient_service.build_patient_messages_response(
        user_id=user_id,
        patient_id=patient_id,
    )


async def send_message_for_patient(
    *,
    user_id: str,
    patient_id: str,
    query: str,
) -> dict:
    from services.routes.chat import patient_service

    question = query.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Empty question.")

    started = time.perf_counter()
    patient_entity, chat_entity = await patient_service.get_patient_for_chat(user_id, patient_id)
    if not patient_entity.evaluation or not patient_entity.recommendation:
        raise HTTPException(status_code=400, detail="Generate a recommendation before chatting.")

    turns_used = sum(
        1
        for message in chat_entity.messages
        if message.get("role") == "user" and message.get("kind", "message") == "message"
    )
    if turns_used >= settings.chat_max_turns:
        raise HTTPException(
            status_code=400,
            detail=f"This consultation has reached the {settings.chat_max_turns}-turn limit.",
        )

    board = patient_entity.recommendation_board or {}
    if patient_entity.evaluation and not board.get("ranked"):
        board = build_recommendation_board(patient_entity.evaluation)

    is_first_chat = not any(
        message.get("role") == "user" and message.get("kind", "message") == "message"
        for message in chat_entity.messages
    )

    history, memory_stats = trim_chat_history(chat_entity.messages)
    logger.info(
        "Follow-up context prepared for patient %s: memory total=%d trimmed=%d",
        patient_id,
        memory_stats.total_messages,
        memory_stats.trimmed_messages,
    )

    req = FollowUpRequest(
        answers=patient_entity.intake_answers,
        evaluation=patient_entity.evaluation,
        recommendation=patient_entity.recommendation,
        messages=history,
        question=question,
    )

    # Generate first, then persist user+assistant in one Dynamo write (lower latency).
    llm_started = time.perf_counter()
    result = followup_questionnaire(req, board=board)
    logger.info(
        "Follow-up LLM completed for patient %s in %.0fms",
        patient_id,
        (time.perf_counter() - llm_started) * 1000,
    )

    await patient_service.append_patient_messages(
        user_id=user_id,
        patient_id=patient_id,
        entries=[
            {"role": "user", "content": question, "kind": "message"},
            {
                "role": "assistant",
                "content": result["answer"],
                "kind": "message",
                "suggested_questions": result["suggested_questions"],
            },
        ],
    )

    logger.info(
        "Follow-up saved for patient %s user %s total=%.0fms",
        patient_id,
        user_id,
        (time.perf_counter() - started) * 1000,
    )
    if is_first_chat:
        try:
            from services.notification import events as notify_events

            notify_events.student_chat_started(
                user_id=user_id,
                patient_name=patient_entity.display_name,
            )
        except Exception:
            logger.exception("Failed to queue chat notification user=%s patient=%s", user_id, patient_id)
    return {
        "answer": result["answer"],
        "suggested_questions": result["suggested_questions"],
    }


_GREETING_PHRASES = (
    "good morning",
    "good afternoon",
    "good evening",
    "how are you doing",
    "how are you",
    "hows it going",
    "how do you do",
    "whats up",
    "hello there",
    "hey there",
    "hi there",
    "hello",
    "hiya",
    "howdy",
    "hey",
    "hi",
)

_FAREWELL_PHRASES = (
    "thank you bye",
    "thanks bye",
    "good night",
    "good bye",
    "see you",
    "see ya",
    "thank you",
    "thats all",
    "im done",
    "all done",
    "goodbye",
    "thanks",
    "bye",
    "cya",
)


def _normalize_social(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9'\s]", " ", (text or "").lower())
    return " ".join(cleaned.replace("'", "").split())


def _phrase_covers(text: str, phrases: tuple[str, ...]) -> bool:
    remaining = text
    ordered = tuple(sorted(phrases, key=len, reverse=True))
    while remaining:
        match = next(
            (phrase for phrase in ordered if remaining == phrase or remaining.startswith(f"{phrase} ")),
            None,
        )
        if not match:
            return False
        remaining = remaining[len(match) :].strip()
    return True


def _social_kind(question: str) -> Optional[str]:
    text = _normalize_social(question)
    if not text or len(text.split()) > 8:
        return None
    farewell = _phrase_covers(text, _FAREWELL_PHRASES)
    greeting = _phrase_covers(text, _GREETING_PHRASES)
    if farewell and not greeting:
        return "farewell"
    if greeting and not farewell:
        return "greeting"
    return None


def _social_reply(question: str) -> Optional[dict]:
    kind = _social_kind(question)
    if kind == "greeting":
        if "how are you" in _normalize_social(question):
            return {
                "answer": "I'm doing well, thanks. What would you like to cover?",
                "suggested_questions": [
                    "What can you help with?",
                    "Show the shortlist?",
                    "How does this work?",
                ],
            }
        return {
            "answer": "Hi. I'm here for this consultation — what would you like to look at?",
            "suggested_questions": [
                "How are you?",
                "What can you help with?",
                "Show the shortlist?",
            ],
        }
    if kind == "farewell":
        return {
            "answer": "Goodbye. I'm here if you want to pick this case back up.",
            "suggested_questions": [
                "One last question?",
                "Summarize this case?",
                "See you later?",
            ],
        }
    return None


def _question_needs_rag(question: str) -> bool:
    if _social_kind(question):
        return False
    q = question.lower()
    # Ranking / board questions are answered from evaluation alone.
    if any(token in q for token in ("why is", "why #", "rank #", "shortlist", "top peptide", "clinical note")):
        return False
    keywords = (
        "mechanism",
        "side effect",
        "detail",
        "explain",
        "storage",
        "handling",
        "evidence",
        "compare",
        "vs ",
        "versus",
        "lab",
        "safety",
        "caution",
        "monitor",
        "how does",
        "stack",
        "contraindic",
        "half-life",
        "reconstitut",
    )
    return any(token in q for token in keywords)


def _compact_answers(answers: dict) -> dict:
    keys = (
        "age",
        "sex",
        "pregnancy",
        "height_cm",
        "weight_kg",
        "activity",
        "cancer",
        "mtc_men2",
        "peptide_allergy",
        "allergy_detail",
        "conditions",
        "medications",
        "primary_goal",
        "secondary_goal",
        "injection_tolerance",
        "complexity",
        "timeline",
    )
    compact = {key: answers[key] for key in keys if key in answers and answers[key] not in ("", None, [])}
    # Keep a few goal-branch fields if present
    for key, value in answers.items():
        if key.startswith(("a_", "b_", "c_", "d_", "e_", "f_", "g_", "h_")) and value not in ("", None, []):
            compact[key] = value
    return compact


def _compact_peptide(peptide: dict) -> dict:
    return {
        "name": peptide.get("name"),
        "evidence": peptide.get("evidence"),
        "best_when": peptide.get("best_when"),
        "score": peptide.get("score"),
        "tags": peptide.get("tags"),
    }


def _compact_evaluation(evaluation: dict) -> dict:
    safety = evaluation.get("safety") or {}
    return {
        "primary_goal": evaluation.get("primary_goal"),
        "secondary_goal": evaluation.get("secondary_goal"),
        "recommendations": [_compact_peptide(p) for p in (evaluation.get("recommendations") or [])[:4]],
        "secondary_recommendations": [
            _compact_peptide(p) for p in (evaluation.get("secondary_recommendations") or [])[:2]
        ],
        "stacks": evaluation.get("stacks") or [],
        "labs": (evaluation.get("labs") or [])[:6],
        "safety": {
            "hard_stops": safety.get("hard_stops") or [],
            "cautions": (safety.get("cautions") or [])[:6],
            "flags": (safety.get("flags") or [])[:6],
            "blocked_peptides": (safety.get("blocked_peptides") or [])[:12],
            "bmi": safety.get("bmi"),
        },
        "disclaimer": evaluation.get("disclaimer"),
    }


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _chat_completion(
    *,
    model: str,
    temperature: float,
    max_tokens: int,
    messages: List[dict],
) -> str:
    llm: OpenAI = _state["llm"]
    resp = llm.chat.completions.create(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=messages,
        extra_body={
            "provider": {"sort": "latency"},
        },
    )
    return (resp.choices[0].message.content or "").strip()


def _retrieve(query: str, k: int) -> tuple[str, List[Source]]:
    collection = _state["collection"]
    res = collection.query(query_texts=[query], n_results=max(1, k))

    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]

    context_parts: List[str] = []
    sources: List[Source] = []
    for i, (doc, meta) in enumerate(zip(docs, metas), start=1):
        meta = meta or {}
        clipped = _truncate(doc, 700)
        context_parts.append(f"[S{i}] {meta.get('course_name', '?')}: {clipped}")
        sources.append(
            Source(
                course_name=str(meta.get("course_name", "")),
                l1_name=str(meta.get("l1_name", "")),
                l2_name=str(meta.get("l2_name", "")),
                lesson_id=str(meta.get("lesson_id", "")),
                preview=doc[:160] + ("..." if len(doc) > 160 else ""),
            )
        )
    return "\n".join(context_parts), sources


def _generate_intake_recommendation(answers: dict, evaluation: dict, context: str) -> str:
    user_prompt = (
        f"INTAKE:\n{json.dumps(_compact_answers(answers), separators=(',', ':'))}\n\n"
        f"EVAL:\n{json.dumps(_compact_evaluation(evaluation), separators=(',', ':'))}\n\n"
        f"KB:\n{_truncate(context, 2400)}\n\n"
        "Write the short Recommendation Card now."
    )
    return _chat_completion(
        model=settings.chat_model,
        temperature=0.15,
        max_tokens=settings.chat_max_tokens_intake,
        messages=[
            {"role": "system", "content": INTAKE_SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
    )


def _followup_turn(question: str, board: Optional[dict]) -> str:
    focus = _focus_peptide(question, board)
    if focus:
        name = str(focus.get("name") or "").strip()
        detail = {
            "name": name,
            "mechanism": focus.get("description") or focus.get("fit"),
            "why": (focus.get("why") or [])[:4],
            "advantages": (focus.get("advantages") or [])[:3],
            "watch_outs": (focus.get("disadvantages") or [])[:3],
            "evidence": focus.get("evidence"),
        }
        return (
            f"{question}\n\n"
            f"The provider asked for details of {name} only. Use this peptide from the board:\n"
            f"{json.dumps(detail, separators=(',', ':'))}\n"
            f"Answer in concise markdown about {name} alone: why it fits this case, how it works, "
            "advantages, and watch-outs. Do not review the other shortlist peptides. "
            f"Bold **{name}**. Suggested questions must stay on {name}. "
            "Return JSON with the answer and 2 or 3 questions of 6 words or fewer."
        )
    return (
        f"{question}\n\n"
        "Reply only to this message, in concise markdown that matches the request. "
        "Use a markdown table if they asked for a table, and bullets if they asked for a list. "
        "Bold peptide names as **Name** when you mention them. "
        "Suggested questions must continue this same topic. "
        "Return JSON with the answer and 2 or 3 questions of 6 words or fewer."
    )


def _focus_peptide(question: str, board: Optional[dict]) -> Optional[dict]:
    """Return the one shortlist peptide named in the question, if exactly one matches."""
    if not board:
        return None
    text = (question or "").lower()
    matches: list[dict] = []
    ranked = [item for item in (board.get("ranked") or []) if item.get("name")]
    for item in sorted(ranked, key=lambda peptide: len(str(peptide.get("name") or "")), reverse=True):
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        if re.search(rf"(?<![a-z0-9]){re.escape(name.lower())}(?![a-z0-9])", text):
            matches.append(item)
    if len(matches) != 1:
        return None
    return matches[0]


def _board_context(board: Optional[dict]) -> str:
    if not board:
        return "(none)"
    ranked = []
    for item in (board.get("ranked") or [])[:4]:
        ranked.append(
            {
                "name": item.get("name"),
                "mechanism": item.get("description") or item.get("fit"),
                "why": (item.get("why") or [])[:3],
                "advantages": (item.get("advantages") or [])[:2],
                "watch_outs": (item.get("disadvantages") or [])[:2],
                "evidence": item.get("evidence"),
            }
        )
    payload = {
        "goal": board.get("primary_goal"),
        "secondary_goal": board.get("secondary_goal"),
        "confidence": board.get("confidence") or "balanced",
        "shortlist": ranked,
        "labs": (board.get("labs") or [])[:6],
        "stacks": board.get("stacks") or [],
        "safety": board.get("safety") or {},
    }
    return json.dumps(payload, separators=(",", ":"))


def _fallback_questions(board: Optional[dict]) -> list[str]:
    if not board:
        return []
    questions = list(board.get("suggested_questions") or board.get("chips") or [])
    cleaned: list[str] = []
    for question in questions:
        text = str(question or "").strip()
        if text and text not in cleaned:
            cleaned.append(text)
        if len(cleaned) >= 3:
            break
    return cleaned


def _short_question(question: str) -> str:
    words = [word for word in question.replace("?", " ").split() if word]
    if not words:
        return ""
    return f"{' '.join(words[:6])}?"


def _parse_followup_payload(raw: str) -> tuple[str, list[str]]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```").strip()
        if text.endswith("```"):
            text = text[: -3].strip()

    data: Any = None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                data = None

    if not isinstance(data, dict):
        return text, []

    answer = str(data.get("answer") or "").strip()
    questions: list[str] = []
    for item in data.get("suggested_questions") or []:
        question = _short_question(str(item or "").strip())
        if question and question not in questions:
            questions.append(question)
        if len(questions) == 3:
            break
    return answer or text, questions


def _generate_followup(
    answers: dict,
    evaluation: dict,
    recommendation: str,
    history: List[ChatMessage],
    question: str,
    context: str,
    board: Optional[dict] = None,
) -> str:
    case_block = (
        f"INTAKE:{json.dumps(_compact_answers(answers), separators=(',', ':'))}\n"
        f"EVAL:{json.dumps(_compact_evaluation(evaluation), separators=(',', ':'))}\n"
        f"BOARD:{_board_context(board)}\n"
        f"CARD:{_truncate(recommendation, 1200)}\n"
        f"KB:{_truncate(context, 1400) if context else '(none)'}"
    )
    llm_messages: List[dict[str, Any]] = [
        {"role": "system", "content": FOLLOWUP_SYSTEM},
        {"role": "user", "content": f"Case (ref only):\n{case_block}"},
        {
            "role": "assistant",
            "content": "Ready — ask briefly.",
        },
    ]
    # Keep enough recent turns for a 50-question consult; memory already token-trims.
    recent = history[-100:] if history else []
    for msg in recent:
        content = msg.content
        if msg.role == "assistant":
            content = _truncate(content, 500)
        else:
            content = _truncate(content, 400)
        llm_messages.append({"role": msg.role, "content": content})
    llm_messages.append(
        {
            "role": "user",
            "content": _followup_turn(question, board),
        }
    )

    return _chat_completion(
        model=settings.chat_model_followup,
        temperature=0.2,
        max_tokens=max(settings.chat_max_tokens_followup, 480),
        messages=llm_messages,
    )
