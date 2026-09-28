"""DynamoDB persistence for adviser patient cases and chat threads."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any, Literal, Optional

from boto3.dynamodb.conditions import Attr, Key
from fastapi import HTTPException, status

from config import settings
from core.async_io import run_sync
from database import get_table
from database_entities import (
    AdviserPatient,
    AdviserPatientChat,
    AdviserPatientStatus,
    now_iso,
)
from services.common.pagination import build_pagination, normalize_value
from services.routes.chat.questionnaire import recommendation_intro, sanitize_intake_answers

logger = logging.getLogger(__name__)

_MESSAGE_CACHE_TTL_SECONDS = 15.0
_message_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _table():
    return get_table()


def _patient_from_item(item: dict[str, Any]) -> AdviserPatient:
    return AdviserPatient(
        user_id=item["user_id"],
        patient_id=item["patient_id"],
        display_name=item["display_name"],
        status=AdviserPatientStatus(item.get("status", AdviserPatientStatus.DRAFT.value)),
        intake_answers=normalize_value(item.get("intake_answers") or {}),
        evaluation=normalize_value(item.get("evaluation")) if item.get("evaluation") else None,
        recommendation=item.get("recommendation"),
        recommendation_board=(
            normalize_value(item.get("recommendation_board"))
            if item.get("recommendation_board")
            else None
        ),
        sources=normalize_value(item.get("sources") or []),
        primary_goal=item.get("primary_goal"),
        message_count=int(item.get("message_count") or 0),
        created_at=item.get("created_at", now_iso()),
        updated_at=item.get("updated_at", now_iso()),
    )


def _chat_from_item(item: dict[str, Any]) -> AdviserPatientChat:
    return AdviserPatientChat(
        user_id=item["user_id"],
        patient_id=item["patient_id"],
        messages=item.get("messages") or [],
        created_at=item.get("created_at", now_iso()),
        updated_at=item.get("updated_at", now_iso()),
    )


def _count_user_turns(messages: list[dict[str, Any]] | None) -> int:
    return sum(
        1
        for message in messages or []
        if message.get("role") == "user" and message.get("kind", "message") == "message"
    )


def _patient_summary(entity: AdviserPatient, message_count: int = 0) -> dict[str, Any]:
    return normalize_value(
        {
            "patient_id": entity.patient_id,
            "display_name": entity.display_name,
            "status": entity.status.value,
            "primary_goal": entity.primary_goal,
            "has_recommendation": bool(entity.recommendation),
            "message_count": message_count,
            "created_at": entity.created_at,
            "updated_at": entity.updated_at,
        }
    )


def _public_recommendation_board(entity: AdviserPatient) -> Optional[dict[str, Any]]:
    """Board shown in chat, including card fields for recommendations already stored."""
    stored = entity.recommendation_board or {}
    if not entity.evaluation:
        return stored or None
    from services.routes.chat.questionnaire import build_recommendation_board

    return build_recommendation_board(
        entity.evaluation,
        confidence=str(stored.get("confidence") or "balanced"),
        preferred=stored.get("preferred"),
    )


def _stamp_recommendation_intro(
    messages: list[dict[str, Any]],
    display_name: str,
    board: Optional[dict[str, Any]],
) -> list[dict[str, Any]]:
    intro = recommendation_intro(display_name, board)
    stamped: list[dict[str, Any]] = []
    for message in messages:
        if message.get("kind") == "recommendation":
            stamped.append({**message, "content": intro})
        else:
            stamped.append(message)
    return stamped


def _patient_detail(
    entity: AdviserPatient,
    chat: AdviserPatientChat,
    *,
    include_messages: bool = False,
    messages: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    board = _public_recommendation_board(entity)

    payload: dict[str, Any] = {
        "patient_id": entity.patient_id,
        "display_name": entity.display_name,
        "status": entity.status.value,
        "intake_answers": entity.intake_answers,
        "evaluation": entity.evaluation,
        "recommendation": entity.recommendation,
        "recommendation_board": board,
        "sources": entity.sources,
        "primary_goal": entity.primary_goal,
        "message_count": entity.message_count if entity.message_count else len(chat.messages),
        "turns_used": _count_user_turns(chat.messages),
        "turns_max": settings.chat_max_turns,
        "created_at": entity.created_at,
        "updated_at": entity.updated_at,
    }
    if include_messages:
        source = messages if messages is not None else chat.messages
        payload["messages"] = _stamp_recommendation_intro(source, entity.display_name, board)
    else:
        payload["messages"] = []
    return normalize_value(payload)


def _batch_get_chat_items(user_id: str, patient_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not patient_ids:
        return {}

    table = _table()
    keys = [
        {
            "PK": AdviserPatientChat.pk(user_id),
            "SK": AdviserPatientChat.sk(patient_id),
        }
        for patient_id in patient_ids
    ]
    found: dict[str, dict[str, Any]] = {}
    for offset in range(0, len(keys), 100):
        chunk = keys[offset : offset + 100]
        response = table.meta.client.batch_get_item(
            RequestItems={
                table.name: {
                    "Keys": chunk,
                    "ProjectionExpression": "patient_id, messages",
                }
            }
        )
        for item in response.get("Responses", {}).get(table.name, []):
            patient_id = item.get("patient_id")
            if patient_id:
                found[str(patient_id)] = item
    return found


def _patient_with_messages_page(
    entity: AdviserPatient,
    chat: AdviserPatientChat,
    *,
    limit: Optional[int] = None,
) -> dict[str, Any]:
    page = _paginate_messages(
        chat.messages,
        limit=limit or settings.chat_messages_page_size,
    )
    detail = _patient_detail(entity, chat)
    detail["messages"] = _stamp_recommendation_intro(page["messages"], entity.display_name, detail.get("recommendation_board"))
    detail["messages_pagination"] = page["pagination"]
    return detail


def _paginate_messages(
    messages: list[dict[str, Any]],
    *,
    limit: int,
    before: Optional[str] = None,
) -> dict[str, Any]:
    total = len(messages)
    if total == 0:
        return normalize_value(
            {
                "messages": [],
                "pagination": {
                    "total": 0,
                    "limit": limit,
                    "has_older": False,
                    "oldest_message_id": None,
                    "newest_message_id": None,
                },
            }
        )

    if before:
        cutoff = next(
            (index for index, message in enumerate(messages) if message.get("message_id") == before),
            total,
        )
        end = cutoff
        start = max(0, end - limit)
    else:
        end = total
        start = max(0, total - limit)

    page = messages[start:end]
    return normalize_value(
        {
            "messages": page,
            "pagination": {
                "total": total,
                "limit": limit,
                "has_older": start > 0,
                "oldest_message_id": page[0].get("message_id") if page else None,
                "newest_message_id": page[-1].get("message_id") if page else None,
            },
        }
    )


async def _get_patient_item(user_id: str, patient_id: str) -> dict[str, Any]:
    def _fetch():
        return _table().get_item(
            Key={
                "PK": AdviserPatient.pk(user_id),
                "SK": AdviserPatient.sk(patient_id),
            }
        ).get("Item")

    item = await run_sync(_fetch)
    if not item or item.get("entity") != AdviserPatient.ENTITY:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    return item


def _message_cache_key(
    user_id: str,
    patient_id: str,
    *,
    limit: int,
    before: Optional[str],
) -> str:
    return f"{user_id}:{patient_id}:{limit}:{before or ''}"


def _read_message_cache(key: str) -> Optional[dict[str, Any]]:
    cached = _message_cache.get(key)
    if not cached:
        return None
    expires_at, payload = cached
    if time.monotonic() >= expires_at:
        _message_cache.pop(key, None)
        return None
    return payload


def _write_message_cache(key: str, payload: dict[str, Any]) -> None:
    _message_cache[key] = (
        time.monotonic() + _MESSAGE_CACHE_TTL_SECONDS,
        payload,
    )


def _invalidate_message_cache(user_id: str, patient_id: str) -> None:
    prefix = f"{user_id}:{patient_id}:"
    for key in list(_message_cache):
        if key.startswith(prefix):
            _message_cache.pop(key, None)


async def _get_chat_item(
    user_id: str,
    patient_id: str,
    *,
    projection: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    def _fetch():
        request: dict[str, Any] = {
            "Key": {
                "PK": AdviserPatientChat.pk(user_id),
                "SK": AdviserPatientChat.sk(patient_id),
            }
        }
        if projection:
            request["ProjectionExpression"] = projection
        return _table().get_item(**request).get("Item")

    item = await run_sync(_fetch)
    if not item or item.get("entity") != AdviserPatientChat.ENTITY:
        return None
    return item


async def create_patient(*, user_id: str, display_name: str) -> dict[str, Any]:
    patient_id = str(uuid.uuid4())
    timestamp = now_iso()
    patient = AdviserPatient(
        user_id=user_id,
        patient_id=patient_id,
        display_name=display_name.strip() or f"Patient {patient_id[:8]}",
        created_at=timestamp,
        updated_at=timestamp,
    )
    chat = AdviserPatientChat(
        user_id=user_id,
        patient_id=patient_id,
        created_at=timestamp,
        updated_at=timestamp,
    )

    def _write():
        table = _table()
        table.put_item(Item=patient.to_item())
        table.put_item(Item=chat.to_item())

    await run_sync(_write)
    try:
        from services.notification import events as notify_events

        notify_events.student_patient_created(user_id=user_id, patient_name=patient.display_name)
    except Exception:
        logger.exception("Failed to queue patient notification user_id=%s", user_id)
    return _patient_detail(patient, chat)


async def list_patients(
    *,
    user_id: str,
    page: int = 1,
    limit: int = 10,
    q: Optional[str] = None,
    status: Literal["all", "progress", "chat"] = "all",
    sort: Literal["newest", "oldest"] = "newest",
) -> dict[str, Any]:
    def _query():
        table = _table()
        collected: list[dict[str, Any]] = []
        kwargs: dict[str, Any] = {
            "KeyConditionExpression": Key("PK").eq(AdviserPatient.pk(user_id))
            & Key("SK").begins_with("PATIENT#"),
            "FilterExpression": Attr("entity").eq(AdviserPatient.ENTITY),
        }
        while True:
            response = table.query(**kwargs)
            collected.extend(response.get("Items", []))
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                return collected
            kwargs["ExclusiveStartKey"] = last_key

    patient_items = await run_sync(_query)
    missing_count_ids = [
        str(item["patient_id"])
        for item in patient_items
        if item.get("message_count") is None
    ]

    chat_map: dict[str, dict[str, Any]] = {}
    if missing_count_ids:
        chat_map = await run_sync(_batch_get_chat_items, user_id, missing_count_ids)

    patients: list[dict[str, Any]] = []
    for item in patient_items:
        entity = _patient_from_item(item)
        if item.get("message_count") is None:
            chat_item = chat_map.get(entity.patient_id)
            message_count = len(chat_item.get("messages") or []) if chat_item else 0
        else:
            message_count = entity.message_count
        patients.append(_patient_summary(entity, message_count))

    needle = (q or "").strip().lower()
    if needle:
        patients = [
            entry
            for entry in patients
            if needle in (entry.get("display_name") or "").lower()
            or needle in (entry.get("primary_goal") or "").lower()
        ]
    if status == "progress":
        patients = [entry for entry in patients if not entry.get("has_recommendation")]
    elif status == "chat":
        patients = [entry for entry in patients if entry.get("has_recommendation")]

    patients.sort(key=lambda entry: entry.get("updated_at") or "", reverse=sort != "oldest")
    total = len(patients)
    start = max(0, (page - 1) * limit)
    page_items = patients[start : start + limit]
    pagination = build_pagination(
        page=page,
        limit=limit,
        total=total,
        has_next=start + limit < total,
    )
    logger.info(
        "Listed %d/%d adviser patients for user %s (page=%s status=%s)",
        len(page_items),
        total,
        user_id,
        page,
        status,
    )
    return {"patients": page_items, "total": total, "pagination": pagination}


async def get_patient_messages(
    *,
    user_id: str,
    patient_id: str,
    limit: int,
    before: Optional[str] = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    cache_key = _message_cache_key(user_id, patient_id, limit=limit, before=before)
    cached = _read_message_cache(cache_key)
    if cached is not None:
        logger.info(
            "Patient messages cache hit for %s in %.1fms",
            patient_id,
            (time.perf_counter() - started) * 1000,
        )
        return cached

    chat_item = await _get_chat_item(user_id, patient_id, projection="entity, messages")
    patient_item = await _get_patient_item(user_id, patient_id)
    patient = _patient_from_item(patient_item)
    if chat_item:
        messages = chat_item.get("messages") or []
    else:
        messages = []

    messages = _stamp_recommendation_intro(
        messages,
        patient.display_name,
        _public_recommendation_board(patient),
    )

    payload = _paginate_messages(messages, limit=limit, before=before)
    _write_message_cache(cache_key, payload)
    logger.info(
        "Patient messages loaded for %s in %.0fms (total=%d page=%d)",
        patient_id,
        (time.perf_counter() - started) * 1000,
        payload["pagination"]["total"],
        len(payload["messages"]),
    )
    return payload


async def get_patient(
    *,
    user_id: str,
    patient_id: str,
    include_messages: bool = False,
    message_limit: Optional[int] = None,
) -> dict[str, Any]:
    patient_item, chat_item = await asyncio.gather(
        _get_patient_item(user_id, patient_id),
        _get_chat_item(user_id, patient_id),
    )
    patient = _patient_from_item(patient_item)
    chat = _chat_from_item(chat_item) if chat_item else AdviserPatientChat(
        user_id=user_id,
        patient_id=patient_id,
    )
    if chat_item and patient.message_count != len(chat.messages):
        patient.message_count = len(chat.messages)
    if include_messages and patient.recommendation:
        return _patient_with_messages_page(patient, chat, limit=message_limit)
    return _patient_detail(patient, chat)


async def get_adviser_bootstrap(
    *,
    user_id: str,
    patient_id: Optional[str] = None,
    message_limit: Optional[int] = None,
    include_messages: bool = True,
    page: int = 1,
    patients_limit: int = 10,
) -> dict[str, Any]:
    started = time.perf_counter()
    limit = message_limit or settings.chat_messages_page_size

    patients_result = await list_patients(user_id=user_id, page=page, limit=patients_limit)
    active_patient = None
    active_id = None

    if patient_id:
        try:
            active_patient = await get_patient(
                user_id=user_id,
                patient_id=patient_id,
                include_messages=include_messages,
                message_limit=limit,
            )
            active_id = patient_id
        except HTTPException as exc:
            if exc.status_code != status.HTTP_404_NOT_FOUND:
                raise
            logger.info(
                "Adviser bootstrap ignored missing patient %s for user %s",
                patient_id,
                user_id,
            )

    if active_patient is None and patients_result["patients"]:
        active_id = patients_result["patients"][0]["patient_id"]
        active_patient = await get_patient(
            user_id=user_id,
            patient_id=active_id,
            include_messages=include_messages,
            message_limit=limit,
        )

    logger.info(
        "Adviser bootstrap for user %s in %.0fms (patients=%d active=%s)",
        user_id,
        (time.perf_counter() - started) * 1000,
        patients_result["total"],
        active_id or "none",
    )
    return {
        "patients": patients_result["patients"],
        "total": patients_result["total"],
        "pagination": patients_result["pagination"],
        "active_patient": active_patient,
        "active_patient_id": active_id,
    }


async def save_patient_intake(
    *,
    user_id: str,
    patient_id: str,
    answers: dict[str, Any],
    display_name: Optional[str] = None,
) -> dict[str, Any]:
    patient_item = await _get_patient_item(user_id, patient_id)
    patient = _patient_from_item(patient_item)
    answers = sanitize_intake_answers(answers)
    patient.intake_answers = answers
    patient.updated_at = now_iso()
    if display_name and display_name.strip():
        patient.display_name = display_name.strip()
    primary_goal = answers.get("primary_goal")
    if isinstance(primary_goal, str) and primary_goal:
        patient.primary_goal = primary_goal

    def _write():
        _table().put_item(Item=patient.to_item())

    await run_sync(_write)
    chat_item = await _get_chat_item(user_id, patient_id)
    chat = _chat_from_item(chat_item) if chat_item else AdviserPatientChat(
        user_id=user_id,
        patient_id=patient_id,
    )
    return _patient_detail(patient, chat)


async def save_patient_recommendation(
    *,
    user_id: str,
    patient_id: str,
    answers: dict[str, Any],
    evaluation: dict[str, Any],
    recommendation: str,
    sources: list[dict[str, Any]],
    recommendation_board: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    patient_item = await _get_patient_item(user_id, patient_id)
    patient = _patient_from_item(patient_item)
    timestamp = now_iso()

    answers = sanitize_intake_answers(answers)
    patient.intake_answers = answers
    patient.evaluation = evaluation
    patient.recommendation = recommendation
    patient.recommendation_board = recommendation_board
    patient.sources = sources
    patient.status = AdviserPatientStatus.RECOMMENDED
    patient.primary_goal = str(evaluation.get("primary_goal") or patient.primary_goal or "")
    patient.updated_at = timestamp

    chat_item = await _get_chat_item(user_id, patient_id)
    if chat_item:
        chat = _chat_from_item(chat_item)
    else:
        chat = AdviserPatientChat(user_id=user_id, patient_id=patient_id, created_at=timestamp)

    intro = recommendation_intro(patient.display_name, recommendation_board)
    chat.messages = [
        {
            "message_id": str(uuid.uuid4()),
            "role": "assistant",
            "content": intro,
            "created_at": timestamp,
            "kind": "recommendation",
        }
    ]
    chat.updated_at = timestamp
    patient.message_count = len(chat.messages)

    def _write():
        table = _table()
        table.put_item(Item=patient.to_item())
        table.put_item(Item=chat.to_item())

    await run_sync(_write)
    _invalidate_message_cache(user_id, patient_id)
    return _patient_detail(patient, chat)


async def append_patient_messages(
    *,
    user_id: str,
    patient_id: str,
    entries: list[dict[str, Any]],
) -> AdviserPatientChat:
    """Append multiple chat messages in a single read/write cycle."""
    patient_item = await _get_patient_item(user_id, patient_id)
    patient = _patient_from_item(patient_item)
    if not patient.recommendation:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Generate a recommendation before starting chat.",
        )

    chat_item = await _get_chat_item(user_id, patient_id)
    chat = _chat_from_item(chat_item) if chat_item else AdviserPatientChat(
        user_id=user_id,
        patient_id=patient_id,
    )

    timestamp = now_iso()
    for entry in entries:
        message: dict[str, Any] = {
            "message_id": str(uuid.uuid4()),
            "role": entry["role"],
            "content": entry["content"],
            "created_at": timestamp,
            "kind": entry.get("kind", "message"),
        }
        questions = [
            str(question).strip()
            for question in (entry.get("suggested_questions") or [])
            if str(question).strip()
        ][:3]
        if questions:
            message["suggested_questions"] = questions
        chat.messages.append(message)
    chat.updated_at = timestamp
    patient.message_count = len(chat.messages)
    patient.status = AdviserPatientStatus.CHATTING
    patient.updated_at = timestamp

    def _write():
        table = _table()
        table.put_item(Item=chat.to_item())
        table.put_item(Item=patient.to_item())

    await run_sync(_write)
    _invalidate_message_cache(user_id, patient_id)
    logger.info(
        "Appended %d chat message(s) for patient %s (total=%d)",
        len(entries),
        patient_id,
        patient.message_count,
    )
    return chat


async def append_patient_message(
    *,
    user_id: str,
    patient_id: str,
    role: str,
    content: str,
    kind: str = "message",
) -> AdviserPatientChat:
    patient_item = await _get_patient_item(user_id, patient_id)
    patient = _patient_from_item(patient_item)
    if not patient.recommendation:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Generate a recommendation before starting chat.",
        )

    chat_item = await _get_chat_item(user_id, patient_id)
    if chat_item:
        chat = _chat_from_item(chat_item)
    else:
        chat = AdviserPatientChat(user_id=user_id, patient_id=patient_id)

    timestamp = now_iso()
    chat.messages.append(
        {
            "message_id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "created_at": timestamp,
            "kind": kind,
        }
    )
    chat.updated_at = timestamp
    patient.message_count = len(chat.messages)
    patient.status = AdviserPatientStatus.CHATTING
    patient.updated_at = timestamp

    def _write():
        table = _table()
        table.put_item(Item=chat.to_item())
        table.put_item(Item=patient.to_item())

    await run_sync(_write)
    _invalidate_message_cache(user_id, patient_id)
    return chat


async def get_patient_for_chat(user_id: str, patient_id: str) -> tuple[AdviserPatient, AdviserPatientChat]:
    patient_item, chat_item = await asyncio.gather(
        _get_patient_item(user_id, patient_id),
        _get_chat_item(user_id, patient_id),
    )
    patient = _patient_from_item(patient_item)
    if not chat_item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient chat not found")
    return patient, _chat_from_item(chat_item)


async def build_patient_messages_response(
    *,
    user_id: str,
    patient_id: str,
    limit: Optional[int] = None,
) -> dict[str, Any]:
    patient, chat = await get_patient_for_chat(user_id, patient_id)
    if patient.message_count != len(chat.messages):
        patient.message_count = len(chat.messages)
    return _patient_with_messages_page(patient, chat, limit=limit)
