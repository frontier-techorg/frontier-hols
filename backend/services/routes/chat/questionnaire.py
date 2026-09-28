"""
questionnaire.py
----------------
Provider-facing patient intake flow (Frontier BioMed v1.0).
Stages 0–7: consent → snapshot → safety gate → goal router → branch
→ history/labs → preferences → ranked peptide output.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

# ---------------------------------------------------------------------------
# Evidence tier weights (for ranking: score = goalFit*0.5 + evidence*0.3 + safety*0.2)
# ---------------------------------------------------------------------------
EVIDENCE_SCORES = {
    "FDA-approved": 1.0,
    "Rx pathway": 0.85,
    "Approved some regions": 0.75,
    "Research": 0.6,
    "Research — common stack": 0.65,
    "Research — synergistic": 0.65,
    "Research (503A change 2026)": 0.55,
    "Research (topical/injectable)": 0.55,
    "Strongest visible-skin evidence": 0.6,
    "Early-stage research": 0.35,
    "Early-stage": 0.35,
    "Early-stage / limited human data": 0.25,
}

# ---------------------------------------------------------------------------
# Goal branches & peptide catalog
# ---------------------------------------------------------------------------
GOAL_BRANCHES = {
    "A": {
        "id": "A",
        "label": "Weight loss / metabolic health",
        "peptides": [
            {"name": "Tirzepatide", "best_when": "Highest weight loss needed (≥20% target), eligible", "evidence": "FDA-approved", "tags": ["glp1", "metabolic"]},
            {"name": "Semaglutide", "best_when": "First-line appetite/weight, GLP-1 candidate", "evidence": "FDA-approved", "tags": ["glp1", "metabolic"]},
            {"name": "Tesamorelin", "best_when": "Visceral/trunk fat focus", "evidence": "FDA-approved", "tags": ["gh", "metabolic"]},
            {"name": "MOTS-c", "best_when": "Metabolic/mitochondrial adjunct, fat oxidation", "evidence": "Early-stage research", "tags": ["metabolic", "growth_promoting"]},
            {"name": "AOD-9604", "best_when": "Mild lipolysis adjunct", "evidence": "Early-stage research", "tags": ["metabolic"]},
        ],
        "labs": ["HbA1c", "Fasting glucose", "Fasting insulin", "Lipid panel"],
    },
    "B": {
        "id": "B",
        "label": "Injury recovery / pain / tissue repair",
        "peptides": [
            {"name": "BPC-157", "best_when": "Tendon/ligament, gut/GI, systemic repair", "evidence": "Research (503A change 2026)", "tags": ["recovery", "growth_promoting"]},
            {"name": "TB-500", "best_when": "Muscle, systemic recovery, flexibility", "evidence": "Research (503A change 2026)", "tags": ["recovery", "growth_promoting"]},
            {"name": "BPC-157 + TB-500", "best_when": "Most common recovery stack — soft-tissue injury", "evidence": "Research — synergistic", "tags": ["recovery", "growth_promoting"], "stack": True},
            {"name": "GHK-Cu", "best_when": "Skin/wound, scar, connective tissue", "evidence": "Research (topical/injectable)", "tags": ["recovery", "aesthetic"]},
            {"name": "KPV", "best_when": "Add when inflammation is the main driver", "evidence": "Early-stage research", "tags": ["recovery", "immune", "growth_promoting"]},
        ],
        "labs": ["Comprehensive metabolic panel"],
    },
    "C": {
        "id": "C",
        "label": "Energy, vitality & healthy aging (GH)",
        "peptides": [
            {"name": "Ipamorelin + CJC-1295", "best_when": "Modern default stack — clean GH pulse, recovery/body comp", "evidence": "Research — common stack", "tags": ["gh", "growth_promoting"], "stack": True},
            {"name": "Sermorelin", "best_when": "Gentler GHRH, closer to natural pulsatility", "evidence": "Rx pathway", "tags": ["gh", "growth_promoting"]},
            {"name": "Tesamorelin", "best_when": "Strongest visceral-fat + IGF-1 evidence", "evidence": "FDA-approved", "tags": ["gh", "metabolic", "growth_promoting"]},
            {"name": "Ipamorelin", "best_when": "Low-noise bedtime pulse, less hunger", "evidence": "Research", "tags": ["gh", "growth_promoting"]},
        ],
        "labs": ["IGF-1 (required)", "Consider thyroid panel"],
    },
    "D": {
        "id": "D",
        "label": "Sexual health / libido",
        "peptides": [
            {"name": "PT-141 (Bremelanotide)", "best_when": "Central low desire/arousal, both sexes; on-demand", "evidence": "Rx pathway", "tags": ["sexual"]},
        ],
        "labs": ["Blood pressure", "Testosterone (context)"],
    },
    "E": {
        "id": "E",
        "label": "Cognitive performance, focus & mood",
        "peptides": [
            {"name": "Semax", "best_when": "Focus, mental fatigue, neuroprotection", "evidence": "Research (503A change 2026)", "tags": ["cognitive", "growth_promoting"]},
            {"name": "Selank", "best_when": "Anxiety/clarity without sedation", "evidence": "Early-stage research", "tags": ["cognitive"]},
            {"name": "Dihexa", "best_when": "Potent synaptogenesis — last-line, caution", "evidence": "Early-stage / limited human data", "tags": ["cognitive"]},
        ],
        "labs": ["Comprehensive metabolic panel"],
    },
    "F": {
        "id": "F",
        "label": "Immune support / recovery from illness",
        "peptides": [
            {"name": "Thymosin alpha-1", "best_when": "T-cell support, immune surveillance, post-illness", "evidence": "Approved some regions", "tags": ["immune"]},
            {"name": "LL-37", "best_when": "Broad antimicrobial + wound support", "evidence": "Early-stage research", "tags": ["immune"]},
            {"name": "KPV", "best_when": "Inflammatory / gut-mediated immune modulation", "evidence": "Early-stage research", "tags": ["immune", "growth_promoting"]},
        ],
        "labs": ["CBC", "Inflammatory markers (CRP)"],
    },
    "G": {
        "id": "G",
        "label": "Skin, hair & aesthetics",
        "peptides": [
            {"name": "GHK-Cu", "best_when": "Collagen/skin remodeling, wound repair, hair follicle", "evidence": "Strongest visible-skin evidence", "tags": ["aesthetic", "recovery"]},
        ],
        "labs": ["Comprehensive metabolic panel"],
    },
    "H": {
        "id": "H",
        "label": "Sleep quality",
        "peptides": [
            {"name": "DSIP", "best_when": "Sleep onset / quality", "evidence": "Early-stage research", "tags": ["sleep", "growth_promoting"]},
            {"name": "Epitalon", "best_when": "Circadian regulation, longevity marker", "evidence": "Early-stage research", "tags": ["sleep", "growth_promoting"]},
            {"name": "GH-axis peptides", "best_when": "Deep-sleep improvement (secondary to Branch C)", "evidence": "Research", "tags": ["sleep", "gh", "growth_promoting"]},
        ],
        "labs": ["Comprehensive metabolic panel"],
    },
}

# Short clinical profile for each catalog peptide. Shown on the recommendation cards.
PEPTIDE_PROFILES: Dict[str, dict] = {
    "Tirzepatide": {
        "description": "A dual incretin option used when the goal is substantial weight loss in an eligible patient.",
        "advantages": ["Strongest weight-loss signal in this catalog", "Addresses appetite and metabolic load together"],
        "disadvantages": ["GI intolerance is common", "Not appropriate with pancreatitis history or pregnancy risk"],
    },
    "Semaglutide": {
        "description": "A GLP-1 option for appetite control and weight loss when a first-line incretin fits the case.",
        "advantages": ["Well-established metabolic evidence", "Useful when appetite is the main driver"],
        "disadvantages": ["Nausea and GI sensitivity can limit use", "Less weight-loss effect than tirzepatide for many patients"],
    },
    "Tesamorelin": {
        "description": "A GHRH analogue aimed at visceral fat, with a role when trunk fat or IGF-1 is the focus.",
        "advantages": ["FDA-approved evidence for visceral fat", "Fits both metabolic and GH-axis goals"],
        "disadvantages": ["Requires an IGF-1 baseline", "Fluid retention and glucose shifts can occur"],
    },
    "MOTS-c": {
        "description": "A mitochondrial peptide considered as a metabolic adjunct when fat oxidation is part of the goal.",
        "advantages": ["Targets metabolic flexibility rather than appetite alone", "Can sit beside a primary weight-loss option"],
        "disadvantages": ["Early-stage human evidence", "Not a substitute for an approved weight-loss therapy"],
    },
    "AOD-9604": {
        "description": "A lipolysis adjunct for milder fat-loss support, not a primary weight-loss therapy.",
        "advantages": ["Narrow metabolic role when only mild support is needed", "Does not act as an appetite drug"],
        "disadvantages": ["Early-stage evidence", "Limited effect compared with approved options"],
    },
    "BPC-157": {
        "description": "A repair peptide considered for tendon, ligament, or gut-focused recovery.",
        "advantages": ["Matches soft-tissue and GI repair goals", "Often the first recovery option on this shortlist"],
        "disadvantages": ["Research status, including 503A changes", "Human outcome data remain limited"],
    },
    "TB-500": {
        "description": "A recovery peptide aimed at muscle repair, flexibility, and broader systemic healing.",
        "advantages": ["Useful when the injury is muscular or widespread", "Pairs with BPC-157 for soft-tissue cases"],
        "disadvantages": ["Research status, including 503A changes", "Less specific for a single tendon or the gut"],
    },
    "BPC-157 + TB-500": {
        "description": "The usual recovery stack when soft-tissue injury needs both local repair and systemic support.",
        "advantages": ["Covers tendon and muscle together", "Common pairing for a mixed injury"],
        "disadvantages": ["Two research peptides, so evidence is still limited", "More complex to monitor than a single option"],
    },
    "GHK-Cu": {
        "description": "A copper peptide for skin, scar, and connective-tissue remodeling.",
        "advantages": ["Best fit when skin or wound healing is the target", "Can be considered topically or by injection"],
        "disadvantages": ["Modest role in deep tendon or muscle injury", "Visible change is slower than a recovery stack"],
    },
    "KPV": {
        "description": "An anti-inflammatory peptide used when inflammation or the gut is driving the problem.",
        "advantages": ["Fits inflammatory and gut-mediated cases", "Can support immune or recovery goals"],
        "disadvantages": ["Early-stage evidence", "Not a stand-alone repair peptide for structural injury"],
    },
    "Ipamorelin + CJC-1295": {
        "description": "A GH-secretagogue stack for a cleaner pulse when recovery or body composition is the goal.",
        "advantages": ["Common default for a GH-axis goal", "Less hunger signal than older secretagogues"],
        "disadvantages": ["Research stack, not an approved drug pair", "Needs IGF-1 context before use"],
    },
    "Sermorelin": {
        "description": "A gentler GHRH option that stays closer to the body's own pulse.",
        "advantages": ["Milder GH stimulation", "Prescription pathway rather than a research-only peptide"],
        "disadvantages": ["Weaker effect on visceral fat than tesamorelin", "Still needs IGF-1 monitoring"],
    },
    "Ipamorelin": {
        "description": "A single GH secretagogue for a low-noise bedtime pulse with less effect on hunger.",
        "advantages": ["Simpler than a two-peptide stack", "Less appetite stimulation"],
        "disadvantages": ["Research evidence only", "Narrower effect than the CJC combination"],
    },
    "PT-141 (Bremelanotide)": {
        "description": "A central option for low desire or arousal, used on demand in both sexes.",
        "advantages": ["Acts on desire rather than blood flow alone", "On-demand use rather than daily therapy"],
        "disadvantages": ["Can raise blood pressure", "Nausea and flushing are common"],
    },
    "Semax": {
        "description": "A cognitive peptide for focus, mental fatigue, and neuroprotection.",
        "advantages": ["Fits a focus or fatigue goal", "Does not rely on sedation"],
        "disadvantages": ["Research status, including 503A changes", "Stimulating effect may unsettle anxious patients"],
    },
    "Selank": {
        "description": "A calming cognitive peptide for anxiety and clarity without sedation.",
        "advantages": ["Fits anxiety or mood more than raw focus", "Less stimulating than Semax"],
        "disadvantages": ["Early-stage evidence", "Not a replacement for prescribed psychiatric care"],
    },
    "Dihexa": {
        "description": "A last-line cognitive peptide aimed at synaptogenesis, kept only with caution.",
        "advantages": ["Reserved for cases that need a stronger cognitive signal", "Distinct from the milder nootropic options"],
        "disadvantages": ["Very limited human data", "Higher uncertainty than Semax or Selank"],
    },
    "Thymosin alpha-1": {
        "description": "An immune peptide for T-cell support after illness or when surveillance is the goal.",
        "advantages": ["Clearest immune option in this catalog", "Approved in some regions"],
        "disadvantages": ["Not a treatment for active autoimmune disease", "Effect is supportive, not curative"],
    },
    "LL-37": {
        "description": "An antimicrobial peptide considered when infection recovery or wound support is the context.",
        "advantages": ["Broad antimicrobial plus wound role", "Fits a post-infection recovery picture"],
        "disadvantages": ["Early-stage evidence", "Can be irritating and is poorly suited to autoimmune cases"],
    },
    "DSIP": {
        "description": "A sleep peptide aimed at falling asleep and sleep quality.",
        "advantages": ["Direct match for onset and quality problems", "Separate from a GH-axis approach"],
        "disadvantages": ["Early-stage evidence", "Does not treat sleep apnea or circadian disorders"],
    },
    "Epitalon": {
        "description": "A longevity-leaning peptide considered when circadian rhythm is part of the sleep problem.",
        "advantages": ["Fits circadian shift more than simple insomnia", "Can sit beside a sleep-quality plan"],
        "disadvantages": ["Early-stage evidence", "Not a first choice for ordinary sleep onset"],
    },
    "GH-axis peptides": {
        "description": "GH-axis options considered when poor deep sleep is secondary to a vitality goal.",
        "advantages": ["Links sleep quality with recovery and body composition", "Useful when Branch C is already in play"],
        "disadvantages": ["Indirect sleep effect", "Needs the same IGF-1 caution as other GH peptides"],
    },
}


def _peptide_profile(name: str) -> dict:
    profile = PEPTIDE_PROFILES.get(name) or {}
    return {
        "description": profile.get("description") or "",
        "advantages": list(profile.get("advantages") or []),
        "disadvantages": list(profile.get("disadvantages") or []),
    }


def _why_chosen(peptide: dict, evaluation: dict, rank: int) -> list[str]:
    """Up to four short reasons this peptide is on the shortlist."""
    bullets: list[str] = []
    best = str(peptide.get("best_when") or "").strip().rstrip(".")
    if best:
        bullets.append(f"{best}.")
    goal = str(evaluation.get("primary_goal") or "").strip()
    if goal:
        bullets.append(f"Matches the primary goal: {goal}.")
    evidence = str(peptide.get("evidence") or "").strip()
    if evidence:
        bullets.append(f"Evidence level: {evidence}.")
    if rank == 1:
        bullets.append("Strongest overall match on this intake.")
    else:
        bullets.append("Kept on the shortlist as a supporting option.")
    deduped: list[str] = []
    for bullet in bullets:
        if bullet not in deduped:
            deduped.append(bullet)
    return deduped[:4]


def _suggested_questions(ranked: list[dict], safety_status: str) -> list[str]:
    questions: list[str] = []
    top = ranked[0]["name"] if ranked else ""
    second = ranked[1]["name"] if len(ranked) > 1 else ""
    if top:
        questions.append(f"Why {top}?")
    if top and second:
        questions.append(f"{top} vs {second}?")
    if safety_status == "blocked":
        questions.append("Which safety blocks?")
    elif safety_status == "caution":
        questions.append("Which cautions apply?")
    else:
        questions.append("Which labs to review?")
    deduped: list[str] = []
    for question in questions:
        if question not in deduped:
            deduped.append(question)
    return deduped[:3]


BRANCH_QUESTIONS: Dict[str, List[dict]] = {
    "A": [
        {"id": "a_bmi_target", "text": "Target weight loss goal (% or lbs)?", "type": "text"},
        {"id": "a_prior_glp1", "text": "Prior GLP-1 use — tried before? Tolerated? Response?", "type": "text"},
        {"id": "a_appetite", "text": "Appetite pattern", "type": "select", "options": ["Constant hunger", "Emotional eating", "Large portions", "Mixed"]},
        {"id": "a_gi", "text": "GI tolerance / nausea history?", "type": "select", "options": ["None", "Mild sensitivity", "Significant nausea history"]},
        {"id": "a_phenotype", "text": "Primary phenotype", "type": "select", "options": ["Overall weight", "Visceral/belly fat focus"]},
    ],
    "B": [
        {"id": "b_injury_type", "text": "Injury type", "type": "select", "options": ["Tendon/ligament", "Muscle", "Joint", "Gut/GI", "Post-surgical", "Bone"]},
        {"id": "b_timing", "text": "Acute (<6 wk) or chronic?", "type": "select", "options": ["Acute", "Chronic"]},
        {"id": "b_location", "text": "Localized vs systemic need?", "type": "select", "options": ["Localized", "Systemic"]},
        {"id": "b_pain", "text": "Pain level (0–10)", "type": "number", "min": 0, "max": 10},
    ],
    "C": [
        {"id": "c_symptoms", "text": "Main symptoms (select all that apply)", "type": "multiselect", "options": ["Fatigue", "Poor recovery", "Low muscle", "Poor sleep", "Low libido"]},
        {"id": "c_igf1", "text": "IGF-1 baseline available?", "type": "select", "options": ["Yes", "No", "Pending"]},
        {"id": "c_emphasis", "text": "Goal emphasis", "type": "select", "options": ["Body composition", "Recovery", "Anti-aging"]},
    ],
    "D": [
        {"id": "d_concern", "text": "Primary concern", "type": "select", "options": ["Low desire", "Arousal", "Erectile function", "Mixed"]},
        {"id": "d_testosterone", "text": "Known low testosterone?", "type": "select", "options": ["Yes", "No", "Unknown"]},
        {"id": "d_cv", "text": "Cardiovascular status / blood pressure", "type": "select", "options": ["Normal", "Controlled HTN", "Uncontrolled HTN / CVD"]},
    ],
    "E": [
        {"id": "e_target", "text": "Primary cognitive target", "type": "select", "options": ["Focus/memory", "Anxiety/mood", "Mental fatigue", "Neuroprotection"]},
        {"id": "e_psych", "text": "Existing anxiety/depression dx or psych meds?", "type": "select", "options": ["Yes", "No"]},
    ],
    "F": [
        {"id": "f_context", "text": "Immune context", "type": "select", "options": ["Frequent infections", "Post-viral recovery", "Autoimmune concern", "General support"]},
        {"id": "f_autoimmune", "text": "Autoimmune disease present?", "type": "select", "options": ["Yes", "No"]},
    ],
    "G": [
        {"id": "g_target", "text": "Aesthetic target", "type": "select", "options": ["Skin remodeling/collagen", "Wound/scar", "Hair thinning"]},
        {"id": "g_route", "text": "Route preference", "type": "select", "options": ["Topical OK", "Injectable OK", "Either"]},
    ],
    "H": [
        {"id": "h_issue", "text": "Sleep issue", "type": "select", "options": ["Onset", "Maintenance", "Quality", "Circadian shift"]},
    ],
}

CONDITIONS_OPTIONS = [
    "None",
    "Pancreatitis history",
    "Severe renal impairment",
    "Severe hepatic impairment",
    "Cardiovascular disease",
    "Uncontrolled hypertension",
    "Diabetes / prediabetes",
    "Thyroid disorder",
    "Autoimmune disease",
    "Other",
]

CONSENT_TEXT = (
    "This tool provides peptide recommendations to support your clinical "
    "decision-making. It does not prescribe, diagnose, or replace professional "
    "judgment. You confirm you are a licensed provider entering information "
    "about a patient."
)


def get_flow_definition() -> dict:
    """Return full questionnaire structure for the UI."""
    return {
        "version": "1.0",
        "consent": {
            "text": CONSENT_TEXT,
            "confirm_label": "I understand — continue",
        },
        "stages": [
            {
                "id": "snapshot",
                "title": "Patient Snapshot",
                "questions": [
                    {"id": "age", "text": "Patient age", "type": "number", "min": 1, "max": 100, "required": True},
                    {"id": "sex", "text": "Biological sex", "type": "select", "options": ["Male", "Female", "Intersex"], "required": True},
                    {"id": "pregnancy", "text": "Pregnant, trying, or breastfeeding?", "type": "select", "options": ["Yes", "No", "N/A"], "required": True},
                    {"id": "height_cm", "text": "Height (cm)", "type": "number", "min": 45, "max": 220, "required": True},
                    {"id": "weight_kg", "text": "Weight (kg)", "type": "number", "min": 4, "max": 300, "required": True},
                    {"id": "activity", "text": "Activity / training level", "type": "select", "options": ["Sedentary", "Recreational", "Athlete"], "required": True},
                ],
            },
            {
                "id": "safety",
                "title": "Safety Gate",
                "description": "Non-overridable filters — red flags suppress unsafe categories.",
                "questions": [
                    {"id": "cancer", "text": "Active or recent (≤5 yr) cancer / malignancy?", "type": "select", "options": ["Active", "Remission", "No"], "required": True},
                    {"id": "mtc_men2", "text": "Personal/family history of medullary thyroid carcinoma or MEN2?", "type": "select", "options": ["Yes", "No"], "required": True},
                    {"id": "peptide_allergy", "text": "Known allergy/reaction to peptides or excipients?", "type": "select", "options": ["Yes", "No"], "required": True},
                    {"id": "allergy_detail", "text": "If yes — which agent(s)?", "type": "text", "required": False, "show_if": {"peptide_allergy": "Yes"}},
                    {"id": "conditions", "text": "Diagnosed conditions", "type": "multiselect", "options": CONDITIONS_OPTIONS, "required": True},
                    {"id": "medications", "text": "Current medications & supplements", "type": "textarea", "required": True},
                ],
            },
            {
                "id": "goal",
                "title": "Goal Router",
                "questions": [
                    {
                        "id": "primary_goal",
                        "text": "Primary goal for this patient",
                        "type": "select",
                        "options": [{"value": k, "label": f"{k}. {v['label']}"} for k, v in GOAL_BRANCHES.items()],
                        "required": True,
                    },
                    {
                        "id": "secondary_goal",
                        "text": "Optional secondary goal (for stack suggestions)",
                        "type": "select",
                        "options": [{"value": "", "label": "None"}] + [{"value": k, "label": f"{k}. {v['label']}"} for k, v in GOAL_BRANCHES.items()],
                        "required": False,
                    },
                ],
            },
            {
                "id": "branch",
                "title": "Goal-Specific Deep Dive",
                "dynamic": True,
                "branches": BRANCH_QUESTIONS,
            },
            {
                "id": "history",
                "title": "History & Labs",
                "questions": [
                    {"id": "prior_therapy", "text": "Prior peptide/hormone therapy? Which, response, side effects?", "type": "textarea", "required": False},
                    {"id": "labs_on_file", "text": "Relevant labs on file?", "type": "textarea", "required": False},
                ],
            },
            {
                "id": "preferences",
                "title": "Preferences",
                "questions": [
                    {"id": "injection_tolerance", "text": "Injection tolerance", "type": "select", "options": ["Daily subcutaneous OK", "Prefer less frequent", "Prefer oral or topical"], "required": True},
                    {"id": "complexity", "text": "Complexity preference", "type": "select", "options": ["Single peptide", "Open to validated stack"], "required": True},
                    {"id": "timeline", "text": "Timeline / commitment", "type": "select", "options": ["Short cycle", "Ongoing"], "required": True},
                ],
            },
        ],
        "goal_branches": {k: {"id": k, "label": v["label"]} for k, v in GOAL_BRANCHES.items()},
    }


def _bmi(height_cm: float, weight_kg: float) -> float:
    if not height_cm or not weight_kg:
        return 0.0
    m = height_cm / 100.0
    return round(weight_kg / (m * m), 1)


def _norm(s: Any) -> str:
    return str(s or "").strip().lower()


def _meds_text(answers: dict) -> str:
    return _norm(answers.get("medications", ""))


def _conditions(answers: dict) -> List[str]:
    raw = answers.get("conditions") or []
    if isinstance(raw, str):
        return [raw] if raw else []
    return list(raw)


def _parse_age(answers: dict) -> Optional[int]:
    age = answers.get("age")
    try:
        return int(age) if age is not None and str(age).strip() != "" else None
    except (TypeError, ValueError):
        return None


PREGNANCY_MIN_AGE = 12
PREGNANCY_MAX_AGE = 55
CHILD_MAX_AGE = 12


def is_pregnancy_applicable(answers: dict) -> bool:
    sex = _norm(answers.get("sex"))
    if sex == "male":
        return False
    age = _parse_age(answers)
    if age is not None and (age < PREGNANCY_MIN_AGE or age >= PREGNANCY_MAX_AGE):
        return False
    return True


def sanitize_intake_answers(answers: dict) -> dict:
    """
    Force pregnancy to N/A for male / young child / older patients,
    clear allergy detail when not applicable, and drop Athlete for young children.
    """
    cleaned = dict(answers or {})
    if not is_pregnancy_applicable(cleaned):
        cleaned["pregnancy"] = "N/A"

    if _norm(cleaned.get("peptide_allergy")) != "yes":
        if cleaned.get("allergy_detail"):
            cleaned["allergy_detail"] = ""

    age = _parse_age(cleaned)
    if age is not None and age < CHILD_MAX_AGE and str(cleaned.get("activity") or "") == "Athlete":
        cleaned["activity"] = ""

    return cleaned


def evaluate_safety(answers: dict) -> dict:
    """
    Apply hard blocks and caution flags from Stage 1–2 + meds.
    Returns blocked_tags, blocked_peptides, hard_stops, cautions, flags.
    """
    answers = sanitize_intake_answers(answers)
    blocked_tags: Set[str] = set()
    blocked_peptides: Set[str] = set()
    hard_stops: List[str] = []
    cautions: List[str] = []
    flags: List[str] = []

    age = _parse_age(answers)

    if age is not None and age < 18:
        hard_stops.append("Patient under 18 — intake stopped. Peptide recommendations not provided for minors.")

    if age is not None and age >= 65:
        flags.append("Age ≥65 — apply conservative dosing.")

    pregnancy = _norm(answers.get("pregnancy"))
    if pregnancy == "yes":
        blocked_tags.update(["glp1", "gh", "growth_promoting", "sexual", "cognitive", "immune", "sleep", "metabolic", "recovery", "aesthetic"])
        hard_stops.append("Pregnancy/trying/breastfeeding — nearly all peptides blocked pending OB review.")

    cancer = _norm(answers.get("cancer"))
    if cancer == "active":
        blocked_tags.update(["growth_promoting", "gh", "recovery"])
        blocked_peptides.update({"BPC-157", "TB-500", "BPC-157 + TB-500", "Sermorelin", "Ipamorelin", "CJC-1295", "Ipamorelin + CJC-1295", "Tesamorelin", "MOTS-c", "Semax", "DSIP", "Epitalon", "KPV"})
        hard_stops.append("Active/recent cancer — growth-promoting peptides suppressed; refer to oncology.")
    elif cancer == "remission":
        blocked_tags.update(["growth_promoting", "gh"])
        cautions.append("Cancer remission — growth-promoting peptides require explicit provider confirmation.")

    if _norm(answers.get("mtc_men2")) == "yes":
        blocked_tags.add("glp1")
        blocked_peptides.update({"Semaglutide", "Tirzepatide"})
        hard_stops.append("MTC/MEN2 history — GLP-1 agents (semaglutide, tirzepatide) hard blocked.")

    if _norm(answers.get("peptide_allergy")) == "yes":
        detail = (answers.get("allergy_detail") or "").strip()
        if detail:
            cautions.append(f"Peptide/excipient allergy reported — exclude: {detail}")
            for token in detail.replace(",", " ").split():
                blocked_peptides.add(token.strip())

    conds = [_norm(c) for c in _conditions(answers)]
    if "pancreatitis history" in conds:
        blocked_tags.add("glp1")
        cautions.append("Pancreatitis history — GLP-1 caution.")
    if "severe renal impairment" in conds or "severe hepatic impairment" in conds:
        flags.append("Severe renal/hepatic impairment — conservative dosing.")
    if "cardiovascular disease" in conds or "uncontrolled hypertension" in conds:
        blocked_peptides.add("PT-141 (Bremelanotide)")
        cautions.append("CVD/uncontrolled HTN — PT-141 contraindicated or high caution.")
    if "autoimmune disease" in conds:
        cautions.append("Autoimmune disease — immune-modulating peptides require caution.")

    meds = _meds_text(answers)
    if any(x in meds for x in ("nitrate", "nitroglycerin", "isosorbide")):
        blocked_peptides.add("PT-141 (Bremelanotide)")
        hard_stops.append("Nitrates reported — PT-141 blocked (interaction risk).")
    if any(x in meds for x in ("insulin", "semaglutide", "tirzepatide", "glp-1", "glp1")):
        cautions.append("Insulin/GLP-1 on board — check stacking and hypoglycemia risk.")

    branch = answers.get("primary_goal") or answers.get("goal")
    if branch == "D" and "uncontrolled" in _norm(answers.get("d_cv", "")):
        blocked_peptides.add("PT-141 (Bremelanotide)")

    if branch == "C" and _norm(answers.get("c_igf1")) == "no":
        flags.append("IGF-1 baseline not on file — obtain before GH secretagogues.")

    if branch == "E" and _norm(answers.get("e_psych")) == "yes":
        cautions.append("Psychiatric history/meds — cognitive peptides need interaction review.")

    if branch == "F" and _norm(answers.get("f_autoimmune")) == "yes":
        cautions.append("Autoimmune present — immune modulation peptides need caution.")

    h = answers.get("height_cm")
    w = answers.get("weight_kg")
    try:
        bmi = _bmi(float(h), float(w)) if h and w else 0
    except (TypeError, ValueError):
        bmi = 0
    if bmi:
        flags.append(f"Calculated BMI: {bmi}")

    return {
        "hard_stops": hard_stops,
        "cautions": cautions,
        "flags": flags,
        "blocked_tags": sorted(blocked_tags),
        "blocked_peptides": sorted(blocked_peptides),
        "bmi": bmi,
        "intake_blocked": bool(hard_stops and age is not None and age < 18),
    }


def _peptide_allowed(p: dict, blocked_tags: Set[str], blocked_peptides: Set[str]) -> bool:
    if p["name"] in blocked_peptides:
        return False
    tags = set(p.get("tags") or [])
    if tags & blocked_tags:
        return False
    return True


def _evidence_score(tier: str) -> float:
    return EVIDENCE_SCORES.get(tier, 0.4)


def _goal_fit_boost(p: dict, answers: dict, branch_id: str) -> float:
    """Simple rule-based goal-fit 0–1."""
    score = 0.7
    prefs = _norm(answers.get("injection_tolerance"))
    if prefs == "prefer oral or topical" and "topical" in _norm(p.get("best_when", "")):
        score += 0.15
    if _norm(answers.get("complexity")) == "open to validated stack" and p.get("stack"):
        score += 0.2
    if branch_id == "A" and _norm(answers.get("a_phenotype")) == "visceral/belly fat focus":
        if "Tesamorelin" in p["name"]:
            score += 0.25
    if branch_id == "B" and _norm(answers.get("b_injury_type")) in ("tendon/ligament", "gut/gi"):
        if "BPC-157" in p["name"]:
            score += 0.2
    if branch_id == "B" and _norm(answers.get("b_injury_type")) == "muscle":
        if "TB-500" in p["name"]:
            score += 0.2
    if branch_id == "E" and _norm(answers.get("e_target")) == "anxiety/mood":
        if "Selank" in p["name"]:
            score += 0.25
    return min(score, 1.0)


def rank_peptides_for_branch(branch_id: str, answers: dict, safety: dict, limit: int = 4) -> List[dict]:
    branch = GOAL_BRANCHES.get(branch_id)
    if not branch:
        return []

    blocked_tags = set(safety.get("blocked_tags") or [])
    blocked_peptides = set(safety.get("blocked_peptides") or [])
    ranked: List[dict] = []

    for p in branch["peptides"]:
        if not _peptide_allowed(p, blocked_tags, blocked_peptides):
            continue
        goal_fit = _goal_fit_boost(p, answers, branch_id)
        ev = _evidence_score(p["evidence"])
        safety_fit = 0.9 if p["name"] not in blocked_peptides else 0.0
        composite = round(goal_fit * 0.5 + ev * 0.3 + safety_fit * 0.2, 3)
        ranked.append({
            **p,
            "score": composite,
            "goal_fit": round(goal_fit, 2),
            "evidence_score": round(ev, 2),
            "reasoning": f"Goal-fit {goal_fit:.0%} · Evidence tier: {p['evidence']}",
        })

    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked[:limit]


def get_recommended_labs(branch_ids: List[str]) -> List[str]:
    labs: List[str] = ["Comprehensive metabolic panel", "Age-appropriate screening"]
    for bid in branch_ids:
        if bid and bid in GOAL_BRANCHES:
            for lab in GOAL_BRANCHES[bid].get("labs", []):
                if lab not in labs:
                    labs.append(lab)
    return labs


def evaluate_intake(answers: dict) -> dict:
    """Full deterministic evaluation — safety + ranked peptides + labs."""
    safety = evaluate_safety(answers)
    if safety.get("intake_blocked"):
        return {
            "safety": safety,
            "recommendations": [],
            "secondary_recommendations": [],
            "labs": [],
            "stacks": [],
            "disclaimer": (
                "Recommendation for provider clinical judgment only — not a prescription. "
                "Defer to Frontier BioMed regulatory guidance for current peptide status (503A, 2026)."
            ),
        }

    primary = answers.get("primary_goal") or answers.get("goal") or ""
    secondary = (answers.get("secondary_goal") or "").strip()

    primary_recs = rank_peptides_for_branch(primary, answers, safety) if primary else []
    secondary_recs = rank_peptides_for_branch(secondary, answers, safety, limit=2) if secondary else []

    stacks = []
    if _norm(answers.get("complexity")) == "open to validated stack":
        if primary == "B" and any(p["name"] == "BPC-157 + TB-500" for p in primary_recs):
            stacks.append("BPC-157 + TB-500 — validated soft-tissue recovery stack")
        if primary == "C" and any("Ipamorelin + CJC-1295" in p["name"] for p in primary_recs):
            stacks.append("Ipamorelin + CJC-1295 — common GH secretagogue stack")

    branch_ids = [b for b in [primary, secondary] if b]
    labs = get_recommended_labs(branch_ids)

    return {
        "safety": safety,
        "primary_goal": GOAL_BRANCHES.get(primary, {}).get("label", primary),
        "secondary_goal": GOAL_BRANCHES.get(secondary, {}).get("label") if secondary else None,
        "recommendations": primary_recs,
        "secondary_recommendations": secondary_recs,
        "stacks": stacks,
        "labs": labs,
        "disclaimer": (
            "These are recommendations to support your clinical decision-making — "
            "not prescriptions or instructions to use. Apply professional judgment. "
            "Peptide regulatory status may change (FDA 503A, PCAC 2026) — verify current "
            "status with Frontier BioMed legal/regulatory guidance before finalizing."
        ),
    }


def build_rag_query(evaluation: dict, answers: dict) -> str:
    """Build a retrieval query from intake for enriched LLM output."""
    names = [p["name"] for p in evaluation.get("recommendations", [])[:4]]
    goal = evaluation.get("primary_goal", "")
    parts = [f"Peptide recommendations for patient goal: {goal}"]
    if names:
        parts.append("Candidate peptides: " + ", ".join(names))
    if evaluation.get("safety", {}).get("cautions"):
        parts.append("Safety cautions: " + "; ".join(evaluation["safety"]["cautions"][:3]))
    return ". ".join(parts)


CONFIDENCE_MODES = ("conservative", "balanced", "aggressive")


def _confidence_sort_key(peptide: dict, confidence: str) -> float:
    """Re-weight ranked peptides for the War Room confidence dial (no LLM)."""
    base = float(peptide.get("score") or 0)
    evidence = float(peptide.get("evidence_score") or _evidence_score(str(peptide.get("evidence") or "")))
    goal_fit = float(peptide.get("goal_fit") or 0.7)
    if confidence == "conservative":
        return evidence * 0.65 + base * 0.35
    if confidence == "aggressive":
        return goal_fit * 0.55 + base * 0.45
    return base


def recommendation_intro(display_name: str, board: Optional[dict] = None) -> str:
    """Greeting shown on the recommendation card."""
    name = (display_name or "").strip() or "there"
    ranked = list((board or {}).get("ranked") or [])
    if ranked:
        return f"Hi {name}, we recommend the following for this case."
    return f"Hi {name}, we are unable to generate a recommendation. {_short_block_reason(board)}"


def _short_block_reason(board: Optional[dict]) -> str:
    safety = (board or {}).get("safety") or {}
    for stop in safety.get("hard_stops") or []:
        text = str(stop or "").strip().rstrip(".")
        if text:
            return f"{text}." if len(text) <= 140 else f"{text[:137].rstrip()}."
    reply = str((board or {}).get("reply") or "").strip()
    if reply:
        return reply if len(reply) <= 160 else f"{reply[:157].rstrip()}."
    return "This case did not produce a peptide shortlist."


def build_recommendation_board(
    evaluation: dict,
    *,
    confidence: str = "balanced",
    preferred: Optional[str] = None,
) -> dict:
    """
    Deterministic War Room board JSON from evaluation.
    No LLM required — safe for UI widgets, dial, and chips.
    """
    mode = confidence if confidence in CONFIDENCE_MODES else "balanced"
    safety = evaluation.get("safety") or {}
    hard_stops = list(safety.get("hard_stops") or [])
    cautions = list(safety.get("cautions") or [])
    flags = list(safety.get("flags") or [])

    if safety.get("intake_blocked") or hard_stops:
        safety_status = "blocked"
    elif cautions:
        safety_status = "caution"
    else:
        safety_status = "clear"

    recs = [dict(p) for p in (evaluation.get("recommendations") or [])]
    recs.sort(key=lambda p: _confidence_sort_key(p, mode), reverse=True)

    preferred_name = (preferred or "").strip() or None
    if preferred_name:
        match = next((p for p in recs if p.get("name") == preferred_name), None)
        if match:
            recs = [match] + [p for p in recs if p.get("name") != preferred_name]

    ranked = []
    for index, peptide in enumerate(recs[:3], start=1):
        name = peptide.get("name", "")
        profile = _peptide_profile(name)
        description = profile["description"] or peptide.get("best_when") or ""
        ranked.append(
            {
                "rank": index,
                "name": name,
                "description": description,
                "why": _why_chosen(peptide, evaluation, index),
                "advantages": profile["advantages"],
                "disadvantages": profile["disadvantages"],
                "evidence": peptide.get("evidence", ""),
                "fit": peptide.get("best_when") or peptide.get("reasoning") or "",
                "score": peptide.get("score"),
                "tags": peptide.get("tags") or [],
            }
        )

    top_name = ranked[0]["name"] if ranked else None
    goal = evaluation.get("primary_goal") or "this case"
    if safety_status == "blocked":
        reply = "Intake safety blocks prevent a peptide shortlist for this case."
    elif top_name and preferred_name == top_name:
        reply = f"Preferred pick locked: {top_name}. Advising around safety and labs for this choice."
    elif top_name:
        reply = f"{top_name} ranks #1 for {goal} ({mode} confidence)."
    else:
        reply = f"No peptides available for {goal} with the current safety profile."

    chips = _suggested_questions(ranked, safety_status)

    return {
        "primary_goal": evaluation.get("primary_goal"),
        "secondary_goal": evaluation.get("secondary_goal"),
        "confidence": mode,
        "preferred": preferred_name,
        "ranked": ranked,
        "labs": list(evaluation.get("labs") or []),
        "stacks": list(evaluation.get("stacks") or []),
        "safety": {
            "status": safety_status,
            "hard_stops": hard_stops,
            "cautions": cautions,
            "flags": flags,
        },
        "reply": reply,
        "chips": chips,
        "suggested_questions": chips,
        "disclaimer": evaluation.get("disclaimer") or "",
    }


