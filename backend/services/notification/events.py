"""Fire-and-forget notification + email hooks for product actions."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from database_entities import UserRole, now_iso
import services.notification.service as notifications

logger = logging.getLogger(__name__)


def _spawn(coro) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.exception("No event loop for notification task")
        return

    task = loop.create_task(coro)

    def _done(done: asyncio.Task) -> None:
        if done.cancelled():
            return
        exc = done.exception()
        if exc:
            logger.exception("Notification task failed: %s", exc)

    task.add_done_callback(_done)


def _email_data(user: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {
        "recipient_name": notifications.display_name(user),
        "account_email": user.get("email"),
        **extra,
    }


async def _safe_emit(**kwargs: Any) -> None:
    try:
        await notifications.emit_user(**kwargs)
    except Exception:
        logger.exception("Failed to emit notification action=%s user_id=%s", kwargs.get("action"), kwargs.get("user_id"))


async def _safe_summary(kind: str) -> None:
    try:
        await notifications.bump_admin_summary(kind)
    except Exception:
        logger.exception("Failed to bump admin summary kind=%s", kind)


async def _safe_admins(action: str, data: dict[str, Any]) -> None:
    try:
        await notifications.emit_admins(action=action, data=data)
    except Exception:
        logger.exception("Failed to emit admin notification action=%s", action)


def student_signed_up(*, student: dict[str, Any], affiliate: Optional[dict[str, Any]] = None) -> None:
    _spawn(_student_signed_up(student=student, affiliate=affiliate))


async def _student_signed_up(*, student: dict[str, Any], affiliate: Optional[dict[str, Any]]) -> None:
    student_name = notifications.display_name(student, "A student")
    if affiliate:
        await _safe_emit(
            user_id=str(affiliate["user_id"]),
            role=UserRole.AFFILIATE.value,
            action="affiliate.student_joined",
            data=_email_data(
                affiliate,
                student_name=student_name,
                cta_path="/affiliate/customers",
            ),
            email_to=affiliate.get("email"),
            send_email=False,
        )
    await _safe_admins(
        "admin.student_joined",
        {
            "student_id": str(student.get("user_id") or ""),
            "student_name": student_name,
            "student_email": student.get("email") or "",
        },
    )
    await _safe_summary("new_students")


def affiliate_account_created(*, affiliate: dict[str, Any], password: Optional[str] = None) -> None:
    _spawn(_affiliate_account_created(affiliate=affiliate, password=password))


async def _affiliate_account_created(*, affiliate: dict[str, Any], password: Optional[str]) -> None:
    await _safe_emit(
        user_id=str(affiliate["user_id"]),
        role=UserRole.AFFILIATE.value,
        action="affiliate.account_created",
        data=_email_data(
            affiliate,
            account_email=affiliate.get("email"),
            invite_code=affiliate.get("invite_code") or "Not set",
            password=password or "",
            cta_path="/login/affiliate",
        ),
        email_to=affiliate.get("email"),
        send_email=False,
    )
    await _safe_admins(
        "admin.affiliate_created",
        {
            "affiliate_id": str(affiliate.get("user_id") or ""),
            "affiliate_name": notifications.display_name(affiliate, "An affiliate"),
            "affiliate_email": affiliate.get("email") or "",
        },
    )
    await _safe_summary("new_affiliates")


def affiliate_invite_sent(*, affiliate: dict[str, Any], recipients: list[str]) -> None:
    _spawn(_affiliate_invite_sent(affiliate=affiliate, recipients=recipients))


async def _affiliate_invite_sent(*, affiliate: dict[str, Any], recipients: list[str]) -> None:
    preview = ", ".join(recipients[:3])
    if len(recipients) > 3:
        preview = f"{preview} +{len(recipients) - 3} more"
    await _safe_emit(
        user_id=str(affiliate["user_id"]),
        role=UserRole.AFFILIATE.value,
        action="affiliate.invite_sent",
        data=_email_data(
            affiliate,
            recipient_summary=preview or "your recipients",
            recipient_count=len(recipients),
            cta_path="/affiliate/customers",
        ),
        send_email=False,
    )
    await _safe_summary("invites")


def payment_failed(
    *,
    user: dict[str, Any],
    plan_type: str,
    amount: float,
    currency: str,
    order_id: str,
    card_last4: Optional[str],
    failure_reason: str,
    previous_plan: Optional[str] = None,
) -> None:
    _spawn(
        _payment_failed(
            user=user,
            plan_type=plan_type,
            amount=amount,
            currency=currency,
            order_id=order_id,
            card_last4=card_last4,
            failure_reason=failure_reason,
            previous_plan=previous_plan,
        )
    )


async def _payment_failed(
    *,
    user: dict[str, Any],
    plan_type: str,
    amount: float,
    currency: str,
    order_id: str,
    card_last4: Optional[str],
    failure_reason: str,
    previous_plan: Optional[str],
) -> None:
    amount_label = notifications.money(amount, currency)
    plan_name = notifications.plan_label(plan_type)
    data = _email_data(
        user,
        plan_name=plan_name,
        previous_plan_name=notifications.plan_label(previous_plan) if previous_plan else "none",
        amount=amount_label,
        order_id=order_id,
        card_last4=card_last4 or "••••",
        failure_reason=failure_reason or "Card charge failed.",
        attempted_at=now_iso(),
        cta_path="/student/plans",
    )
    await _safe_emit(
        user_id=str(user["user_id"]),
        role=UserRole.STUDENT.value,
        action="student.payment_failed",
        data=data,
        email_to=user.get("email"),
    )
    if previous_plan:
        from services.common import email as email_service

        await email_service.send_template_email(
            "plan_change_failed",
            user.get("email"),
            **{**data, "cta_path": "/student/plans"},
        )
    await _safe_summary("payment_failures")


def purchase_paid(
    *,
    user: dict[str, Any],
    plan_type: str,
    previous_plan: Optional[str],
    plan_changed: bool,
    amount: float,
    currency: str,
    order_id: str,
    card_last4: Optional[str],
    end_date: Optional[str],
    affiliate: Optional[dict[str, Any]] = None,
    affiliate_commission: float = 0,
) -> None:
    _spawn(
        _purchase_paid(
            user=user,
            plan_type=plan_type,
            previous_plan=previous_plan,
            plan_changed=plan_changed,
            amount=amount,
            currency=currency,
            order_id=order_id,
            card_last4=card_last4,
            end_date=end_date,
            affiliate=affiliate,
            affiliate_commission=affiliate_commission,
        )
    )


async def _purchase_paid(
    *,
    user: dict[str, Any],
    plan_type: str,
    previous_plan: Optional[str],
    plan_changed: bool,
    amount: float,
    currency: str,
    order_id: str,
    card_last4: Optional[str],
    end_date: Optional[str],
    affiliate: Optional[dict[str, Any]],
    affiliate_commission: float,
) -> None:
    amount_label = notifications.money(amount, currency)
    plan_name = notifications.plan_label(plan_type)
    student_name = notifications.display_name(user, "A student")
    shared = _email_data(
        user,
        plan_name=plan_name,
        previous_plan_name=notifications.plan_label(previous_plan) if previous_plan else "none",
        amount=amount_label,
        order_id=order_id,
        card_last4=card_last4 or "••••",
        payment_date=now_iso(),
        order_date=now_iso(),
        end_date=end_date or "",
        student_name=student_name,
        cta_path="/student/profile/orders",
    )
    await _safe_emit(
        user_id=str(user["user_id"]),
        role=UserRole.STUDENT.value,
        action="student.order_placed",
        data=shared,
        email_to=user.get("email"),
    )
    await _safe_emit(
        user_id=str(user["user_id"]),
        role=UserRole.STUDENT.value,
        action="student.payment_success",
        data=shared,
        email_to=user.get("email"),
    )
    if plan_changed:
        await _safe_emit(
            user_id=str(user["user_id"]),
            role=UserRole.STUDENT.value,
            action="student.plan_changed",
            data={**shared, "cta_path": "/student/plans"},
            email_to=user.get("email"),
        )

    if affiliate:
        margin = affiliate.get("margin_percent")
        margin_label = f"{margin}%" if margin is not None else ""
        commission_label = notifications.money(affiliate_commission, currency)
        aff_data = _email_data(
            affiliate,
            student_name=student_name,
            plan_name=plan_name,
            amount=amount_label,
            commission_amount=commission_label,
            margin_percent=margin_label,
            order_id=order_id,
            order_date=now_iso(),
            pending_payout=commission_label,
            previous_plan_name=notifications.plan_label(previous_plan) if previous_plan else "none",
            cta_path="/affiliate/payout",
        )
        await _safe_emit(
            user_id=str(affiliate["user_id"]),
            role=UserRole.AFFILIATE.value,
            action="affiliate.referral_order",
            data=aff_data,
            email_to=affiliate.get("email"),
        )
        if affiliate_commission > 0:
            await _safe_emit(
                user_id=str(affiliate["user_id"]),
                role=UserRole.AFFILIATE.value,
                action="affiliate.commission_earned",
                data=aff_data,
                email_to=affiliate.get("email"),
            )
        if plan_changed:
            await _safe_emit(
                user_id=str(affiliate["user_id"]),
                role=UserRole.AFFILIATE.value,
                action="affiliate.student_plan_changed",
                data={**aff_data, "cta_path": "/affiliate/customers"},
                send_email=False,
            )
    await _safe_admins(
        "admin.order_placed",
        {
            "student_id": str(user.get("user_id") or ""),
            "student_name": student_name,
            "student_email": user.get("email") or "",
            "plan_name": plan_name,
            "amount": amount_label,
            "order_id": order_id,
        },
    )
    await _safe_summary("orders")


def payout_requested(
    *,
    affiliate: dict[str, Any],
    amount: float,
    currency: str,
    payout_id: str,
    requested_at: str,
) -> None:
    _spawn(
        _payout_requested(
            affiliate=affiliate,
            amount=amount,
            currency=currency,
            payout_id=payout_id,
            requested_at=requested_at,
        )
    )


async def _payout_requested(
    *,
    affiliate: dict[str, Any],
    amount: float,
    currency: str,
    payout_id: str,
    requested_at: str,
) -> None:
    amount_label = notifications.money(amount, currency)
    await _safe_emit(
        user_id=str(affiliate["user_id"]),
        role=UserRole.AFFILIATE.value,
        action="affiliate.payout_requested",
        data=_email_data(
            affiliate,
            payout_amount=amount_label,
            payout_id=payout_id,
            requested_at=requested_at,
            cta_path="/affiliate/payout",
        ),
        email_to=affiliate.get("email"),
    )
    await _safe_summary("payout_requests")


def payout_reviewed(
    *,
    affiliate_id: str,
    amount: float,
    currency: str,
    payout_id: str,
    accepted: bool,
    reviewed_at: str,
    payout_method: str = "Bank transfer",
) -> None:
    _spawn(
        _payout_reviewed(
            affiliate_id=affiliate_id,
            amount=amount,
            currency=currency,
            payout_id=payout_id,
            accepted=accepted,
            reviewed_at=reviewed_at,
            payout_method=payout_method,
        )
    )


async def _payout_reviewed(
    *,
    affiliate_id: str,
    amount: float,
    currency: str,
    payout_id: str,
    accepted: bool,
    reviewed_at: str,
    payout_method: str,
) -> None:
    affiliate = await notifications._get_user(affiliate_id) or {"user_id": affiliate_id}
    amount_label = notifications.money(amount, currency)
    action = "affiliate.payout_accepted" if accepted else "affiliate.payout_rejected"
    await _safe_emit(
        user_id=affiliate_id,
        role=UserRole.AFFILIATE.value,
        action=action,
        data=_email_data(
            affiliate,
            payout_amount=amount_label,
            payout_id=payout_id,
            payout_date=reviewed_at,
            reviewed_at=reviewed_at,
            payout_method=payout_method,
            pending_payout=notifications.money(0, currency),
            cta_path="/affiliate/payout",
        ),
        email_to=affiliate.get("email"),
    )
    await _safe_summary("payout_reviews")


def lock_released(
    *,
    affiliate_id: str,
    amount: float,
    currency: str,
    order_id: str,
) -> None:
    _spawn(
        _lock_released(
            affiliate_id=affiliate_id,
            amount=amount,
            currency=currency,
            order_id=order_id,
        )
    )


async def _lock_released(
    *,
    affiliate_id: str,
    amount: float,
    currency: str,
    order_id: str,
) -> None:
    affiliate = await notifications._get_user(affiliate_id) or {"user_id": affiliate_id}
    await _safe_emit(
        user_id=affiliate_id,
        role=UserRole.AFFILIATE.value,
        action="affiliate.lock_released",
        data=_email_data(
            affiliate,
            amount=notifications.money(amount, currency),
            order_id=order_id or "—",
            released_at=now_iso(),
            cta_path="/affiliate/payout",
        ),
        email_to=affiliate.get("email"),
    )
    await _safe_summary("lock_releases")


def student_quiz_submitted(
    *,
    user_id: str,
    lesson_title: str,
    score_percent: float,
    passed: bool,
) -> None:
    _spawn(
        _student_quiz_submitted(
            user_id=user_id,
            lesson_title=lesson_title,
            score_percent=score_percent,
            passed=passed,
        )
    )


async def _student_quiz_submitted(
    *,
    user_id: str,
    lesson_title: str,
    score_percent: float,
    passed: bool,
) -> None:
    user = await notifications._get_user(user_id) or {"user_id": user_id, "role": UserRole.STUDENT.value}
    await _safe_emit(
        user_id=user_id,
        role=UserRole.STUDENT.value,
        action="student.quiz_submitted",
        data=_email_data(
            user,
            lesson_title=lesson_title or "Lesson",
            score_percent=f"{float(score_percent):.0f}",
            result_label="Passed" if passed else "Try again",
            cta_path="/student/lectures",
        ),
        send_email=False,
    )
    await _safe_summary("quizzes")


def student_patient_created(*, user_id: str, patient_name: str) -> None:
    _spawn(_student_patient_created(user_id=user_id, patient_name=patient_name))


async def _student_patient_created(*, user_id: str, patient_name: str) -> None:
    user = await notifications._get_user(user_id) or {"user_id": user_id}
    await _safe_emit(
        user_id=user_id,
        role=UserRole.STUDENT.value,
        action="student.patient_created",
        data=_email_data(user, patient_name=patient_name or "Patient", cta_path="/student/adviser"),
        send_email=False,
    )
    await _safe_summary("patients")


def student_recommendation_ready(*, user_id: str, patient_name: str) -> None:
    _spawn(_student_recommendation_ready(user_id=user_id, patient_name=patient_name))


async def _student_recommendation_ready(*, user_id: str, patient_name: str) -> None:
    user = await notifications._get_user(user_id) or {"user_id": user_id}
    await _safe_emit(
        user_id=user_id,
        role=UserRole.STUDENT.value,
        action="student.recommendation_ready",
        data=_email_data(user, patient_name=patient_name or "Patient", cta_path="/student/adviser"),
        send_email=False,
    )
    await _safe_summary("recommendations")


def student_chat_started(*, user_id: str, patient_name: str) -> None:
    _spawn(_student_chat_started(user_id=user_id, patient_name=patient_name))


async def _student_chat_started(*, user_id: str, patient_name: str) -> None:
    user = await notifications._get_user(user_id) or {"user_id": user_id}
    await _safe_emit(
        user_id=user_id,
        role=UserRole.STUDENT.value,
        action="student.chat_started",
        data=_email_data(user, patient_name=patient_name or "Patient", cta_path="/student/adviser"),
        send_email=False,
    )
    await _safe_summary("chats")


def _webinar_data(webinar: dict[str, Any]) -> dict[str, Any]:
    webinar_id = str(webinar.get("webinar_id") or "")
    return {
        "webinar_id": webinar_id,
        "webinar_title": str(webinar.get("title") or "Webinar"),
        "starts_at": str(webinar.get("starts_at") or ""),
        "cta_path": f"/student/webinars/{webinar_id}" if webinar_id else "/student/webinars",
    }


async def _notify_students_webinar(action: str, webinar: dict[str, Any]) -> None:
    try:
        await notifications.emit_role(
            role=UserRole.STUDENT.value,
            action=action,
            data=_webinar_data(webinar),
            send_email=False,
        )
    except Exception:
        logger.exception("Failed to notify students action=%s webinar_id=%s", action, webinar.get("webinar_id"))
    await _safe_summary("webinars")


def webinar_created(*, webinar: dict[str, Any]) -> None:
    if str(webinar.get("status") or "") != "published":
        return
    _spawn(_notify_students_webinar("student.webinar_published", webinar))


def webinar_updated(*, webinar: dict[str, Any], previous_status: str, changed: bool) -> None:
    _spawn(
        _webinar_updated(
            webinar=webinar,
            previous_status=previous_status,
            changed=changed,
        )
    )


async def _webinar_updated(
    *,
    webinar: dict[str, Any],
    previous_status: str,
    changed: bool,
) -> None:
    status = str(webinar.get("status") or "")
    was_published = previous_status == "published"
    if status == "published":
        if not was_published:
            await _notify_students_webinar("student.webinar_published", webinar)
        elif changed:
            await _notify_students_webinar("student.webinar_updated", webinar)
        return
    if was_published and changed:
        await _notify_students_webinar("student.webinar_cancelled", webinar)


def student_joined_webinar(*, student: dict[str, Any], webinar: dict[str, Any]) -> None:
    _spawn(_student_joined_webinar(student=student, webinar=webinar))


async def _student_joined_webinar(*, student: dict[str, Any], webinar: dict[str, Any]) -> None:
    webinar_id = str(webinar.get("webinar_id") or "")
    title = str(webinar.get("title") or "Webinar")
    student_name = notifications.display_name(student, "A student")
    await _safe_emit(
        user_id=str(student["user_id"]),
        role=UserRole.STUDENT.value,
        action="student.webinar_booked",
        data=_email_data(
            student,
            webinar_id=webinar_id,
            webinar_title=title,
            cta_path=f"/student/webinars/{webinar_id}" if webinar_id else "/student/webinars",
        ),
        send_email=False,
    )
    await _safe_admins(
        "admin.webinar_joined",
        {
            "student_id": str(student.get("user_id") or ""),
            "student_name": student_name,
            "student_email": student.get("email") or "",
            "webinar_id": webinar_id,
            "webinar_title": title,
        },
    )
    await _safe_summary("webinar_bookings")
