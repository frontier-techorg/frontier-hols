"""Quiz submission, scoring, and test-result persistence for lessons."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from boto3.dynamodb.conditions import Key
from fastapi import HTTPException, status

from core.async_io import run_sync
from database import get_table
from database_entities import Lesson, LessonTestResult, now_iso
from services.common.pagination import build_pagination, normalize_value
from services.routes.lectures import service as lectures_service
from services.routes.lectures.quiz_utils import PASS_THRESHOLD, grade_variant

logger = logging.getLogger(__name__)


def _table():
    return get_table()


async def _fetch_lesson_raw(course_id: str, lesson_id: str) -> dict[str, Any]:
    if course_id not in lectures_service._lesson_key_cache:
        await lectures_service.get_course_bundle(course_id)

    lesson_sk = lectures_service._lesson_key_cache.get(course_id, {}).get(lesson_id)
    if not lesson_sk:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")

    def _fetch():
        return _table().get_item(
            Key={"PK": Lesson.pk(course_id), "SK": lesson_sk},
        ).get("Item")

    item = await run_sync(_fetch)
    if not item or item.get("entity") != Lesson.ENTITY:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found")
    return item


def _result_payload(entity: LessonTestResult) -> dict[str, Any]:
    return normalize_value(
        {
            "course_id": entity.course_id,
            "lesson_id": entity.lesson_id,
            "lesson_title": entity.lesson_title,
            "lesson_order": entity.lesson_order,
            "attempt_id": entity.attempt_id,
            "total_questions": entity.total_questions,
            "correct_count": entity.correct_count,
            "score_percent": entity.score_percent,
            "passed": entity.passed,
            "answers": entity.answers,
            "created_at": entity.created_at,
            "updated_at": entity.updated_at,
        }
    )


def _summary_payload(entity: LessonTestResult) -> dict[str, Any]:
    return normalize_value(
        {
            "course_id": entity.course_id,
            "lesson_id": entity.lesson_id,
            "lesson_title": entity.lesson_title,
            "lesson_order": entity.lesson_order,
            "attempt_id": entity.attempt_id,
            "total_questions": entity.total_questions,
            "correct_count": entity.correct_count,
            "score_percent": entity.score_percent,
            "passed": entity.passed,
            "updated_at": entity.updated_at,
        }
    )


async def submit_lesson_quiz(
    *,
    user_id: str,
    course_id: str,
    lesson_id: str,
    answers: list[dict[str, Any]],
) -> dict[str, Any]:
    await lectures_service.ensure_course_exists(course_id)
    lesson_item = await _fetch_lesson_raw(course_id, lesson_id)
    variants = [variant for variant in (lesson_item.get("variants") or []) if isinstance(variant, dict)]

    if not variants:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This lesson has no quiz questions")

    answer_map = {
        str(entry.get("variant_id")): entry.get("answer")
        for entry in answers
        if entry.get("variant_id")
    }

    if len(answer_map) != len(variants):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Answer every quiz question before submitting")

    graded_answers: list[dict[str, Any]] = []
    correct_count = 0

    for variant in variants:
        variant_id = str(variant.get("id") or "")
        if variant_id not in answer_map:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Answer every quiz question before submitting")

        user_answer = answer_map[variant_id]
        is_correct, correct_answer, question = grade_variant(variant, user_answer)
        if is_correct:
            correct_count += 1

        graded_answers.append(
            normalize_value(
                {
                    "variant_id": variant_id,
                    "variant_type": variant.get("variant_type"),
                    "question": question,
                    "user_answer": user_answer,
                    "correct_answer": correct_answer,
                    "is_correct": is_correct,
                }
            )
        )

    total_questions = len(variants)
    score_percent = round((correct_count / total_questions) * 100, 2) if total_questions else 0.0
    passed = score_percent >= PASS_THRESHOLD
    timestamp = now_iso()

    existing = await _get_test_result_item(user_id, course_id, lesson_id)
    attempt_id = str(existing.get("attempt_id") if existing else uuid.uuid4())
    created_at = str(existing.get("created_at") if existing else timestamp)

    result = LessonTestResult(
        user_id=user_id,
        course_id=course_id,
        lesson_id=lesson_id,
        lesson_title=str(lesson_item.get("title") or "Lesson"),
        lesson_order=int(lesson_item.get("order") or 0),
        attempt_id=attempt_id,
        total_questions=total_questions,
        correct_count=correct_count,
        score_percent=score_percent,
        passed=passed,
        answers=graded_answers,
        created_at=created_at,
        updated_at=timestamp,
    )

    await run_sync(_table().put_item, Item=result.to_item())
    logger.info(
        "Stored lesson quiz result user=%s course=%s lesson=%s score=%s passed=%s",
        user_id,
        course_id,
        lesson_id,
        score_percent,
        passed,
    )
    try:
        from services.notification import events as notify_events

        notify_events.student_quiz_submitted(
            user_id=user_id,
            lesson_title=str(result.lesson_title or "Lesson"),
            score_percent=score_percent,
            passed=passed,
        )
    except Exception:
        logger.exception("Failed to queue quiz notification user=%s lesson=%s", user_id, lesson_id)
    return _result_payload(result)


async def _get_test_result_item(user_id: str, course_id: str, lesson_id: str) -> Optional[dict[str, Any]]:
    def _fetch():
        return _table().get_item(
            Key={
                "PK": LessonTestResult.pk(user_id),
                "SK": LessonTestResult.sk(course_id, lesson_id),
            }
        ).get("Item")

    item = await run_sync(_fetch)
    if item and item.get("entity") == LessonTestResult.ENTITY:
        return item
    return None


async def get_lesson_test_result(user_id: str, course_id: str, lesson_id: str) -> dict[str, Any]:
    await lectures_service.ensure_course_exists(course_id)
    item = await _get_test_result_item(user_id, course_id, lesson_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Test result not found")
    return normalize_value(item)


async def list_course_test_results(
    user_id: str,
    course_id: str,
    *,
    page: int = 1,
    limit: int = 10,
) -> dict[str, Any]:
    if page < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "page must be >= 1")
    if limit < 1 or limit > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "limit must be between 1 and 100")

    course = await lectures_service.ensure_course_exists(course_id)

    def _query_all():
        collected: list[dict[str, Any]] = []
        start_key = None
        while True:
            kwargs: dict[str, Any] = {
                "KeyConditionExpression": Key("PK").eq(LessonTestResult.pk(user_id))
                & Key("SK").begins_with(f"TEST_RESULT#{course_id}#"),
                "ScanIndexForward": False,
            }
            if start_key:
                kwargs["ExclusiveStartKey"] = start_key
            response = _table().query(**kwargs)
            collected.extend(response.get("Items") or [])
            start_key = response.get("LastEvaluatedKey")
            if not start_key:
                break
        return collected

    raw_items = await run_sync(_query_all)
    items = [item for item in raw_items if item.get("entity") == LessonTestResult.ENTITY]
    items.sort(
        key=lambda item: (str(item.get("updated_at") or ""), int(item.get("lesson_order") or 0)),
        reverse=True,
    )

    summaries = [_summary_payload(LessonTestResult.model_validate(item)) for item in items]
    total = len(summaries)
    start = (page - 1) * limit
    end = start + limit
    page_items = summaries[start:end]

    total_lessons = int(course.get("lesson_count") or 0)
    lessons_quizzed = total
    average_score = round(
        sum(float(item["score_percent"]) for item in summaries) / lessons_quizzed,
        2,
    ) if lessons_quizzed else 0.0
    passed_count = sum(1 for item in summaries if item.get("passed"))

    return normalize_value(
        {
            "course_id": course_id,
            "summary": {
                "lessons_quizzed": lessons_quizzed,
                "total_lessons": total_lessons,
                "average_score": average_score,
                "passed_count": passed_count,
            },
            "items": page_items,
            "pagination": build_pagination(
                page=page,
                limit=limit,
                total=total,
                has_next=end < total,
                next_cursor=None,
            ),
        }
    )
