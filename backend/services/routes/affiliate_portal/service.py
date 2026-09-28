"""Affiliate self-service business logic."""

from __future__ import annotations

import asyncio
import logging
from decimal import Decimal
from typing import Any, Optional
from urllib.parse import urlencode

from boto3.dynamodb.conditions import Key
from fastapi import HTTPException, status

from core.async_io import run_sync
from database import get_table
from database_entities import UserRole
from models.users import StudentAffiliateInfo
from services.common import email as email_service
from services.common.pagination import build_pagination, normalize_value
from services.routes.auth import service as auth_service
from services.routes.payout import service as payout_service

logger = logging.getLogger(__name__)


def _table():
    return get_table()


def _as_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return int(value)
    return int(value)


def _normalize_invite_code(invite_code: str) -> str:
    return invite_code.strip().upper()


async def _get_affiliate(affiliate_id: str) -> dict[str, Any]:
    affiliate = await auth_service.get_user_by_id(affiliate_id)
    if not affiliate or affiliate.get("role") != UserRole.AFFILIATE.value:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Affiliate not found")
    return affiliate


async def resolve_invite_code(invite_code: str) -> dict[str, Any]:
    normalized = _normalize_invite_code(invite_code)
    if not normalized:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite code not found")

    def _get():
        return _table().get_item(Key={"PK": f"INVITE#{normalized}", "SK": "AFFILIATE"})

    response = await run_sync(_get)
    invite_item = response.get("Item")
    if not invite_item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite code not found")

    affiliate = await _get_affiliate(invite_item["affiliate_id"])
    return {
        "affiliate_id": affiliate["user_id"],
        "invite_code": normalized,
        "first_name": affiliate.get("first_name"),
        "last_name": affiliate.get("last_name"),
        "student_count": _as_int(affiliate.get("student_count")) or 0,
        "invitation_quota": _as_int(affiliate.get("invitation_quota")),
    }


def _signup_path(affiliate: dict[str, Any]) -> str:
    invite_code = affiliate.get("invite_code")
    query = {"affiliate_id": affiliate["user_id"]}
    if invite_code:
        query["ref"] = invite_code
    return f"/signup?{urlencode(query)}"


def build_invite_url(affiliate: dict[str, Any]) -> dict[str, Any]:
    signup_path = _signup_path(affiliate)
    return {
        "affiliate_id": affiliate["user_id"],
        "invite_code": affiliate.get("invite_code"),
        "signup_path": signup_path,
        "public_url": email_service.frontend_url(signup_path),
        "student_count": _as_int(affiliate.get("student_count")) or 0,
        "invitation_quota": _as_int(affiliate.get("invitation_quota")),
    }


async def get_invite_url(affiliate_id: str) -> dict[str, Any]:
    affiliate = await _get_affiliate(affiliate_id)
    return build_invite_url(affiliate)


async def send_student_invites(
    *,
    affiliate_id: str,
    recipients: list[str],
    message: Optional[str] = None,
) -> dict[str, Any]:
    affiliate = await _get_affiliate(affiliate_id)
    if not affiliate.get("invite_code"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Affiliate invite code is not assigned")

    invite_url = build_invite_url(affiliate)
    first_name = affiliate.get("first_name") or "Your HOLS affiliate"
    personal_message = (message or "").strip()
    invite_extra = (
        f"Message from {first_name}: {personal_message}"
        if personal_message
        else f"Invite link: {invite_url['public_url']}"
    )

    for recipient in recipients:
        try:
            rendered = email_service.render_email(
                "invite_to_join",
                recipient_name="there",
                inviter_name=first_name,
                cta_url=invite_url["public_url"],
                invite_extra=invite_extra,
            )
            await email_service.send_email_async(
                to=recipient,
                subject=rendered["subject"],
                html_body=rendered["html_body"],
            )
        except Exception:
            logger.exception("Failed to send affiliate student invite to %s", recipient)

    logger.info("Affiliate %s queued %s student invite emails", affiliate_id, len(recipients))
    try:
        from services.notification import events as notify_events

        notify_events.affiliate_invite_sent(affiliate=affiliate, recipients=recipients)
    except Exception:
        logger.exception("Failed to queue affiliate invite notification affiliate_id=%s", affiliate_id)
    return {
        "queued": True,
        "public_url": invite_url["public_url"],
        "recipients": recipients,
        "recipient_count": len(recipients),
    }


def _affiliate_info(affiliate: dict[str, Any]) -> dict[str, Any]:
    clean = auth_service.public_profile(affiliate)
    return StudentAffiliateInfo(
        user_id=clean["user_id"],
        email=clean["email"],
        first_name=clean["first_name"],
        last_name=clean["last_name"],
        invite_code=clean.get("invite_code"),
        margin_percent=normalize_value(clean.get("margin_percent")),
        invitation_quota=_as_int(clean.get("invitation_quota")),
        student_count=_as_int(clean.get("student_count")) or 0,
        created_at=clean.get("created_at"),
    ).model_dump()


def _student_summary(student: dict[str, Any], affiliate: dict[str, Any]) -> dict[str, Any]:
    clean = auth_service.public_profile(student)
    return {
        "user_id": clean["user_id"],
        "email": clean["email"],
        "first_name": clean["first_name"],
        "last_name": clean["last_name"],
        "marketing_pref": clean.get("marketing_pref", False),
        "referred_by_affiliate_id": clean.get("referred_by_affiliate_id"),
        "affiliate": _affiliate_info(affiliate),
        "total_spent": 0.0,
        "admin_earned": 0.0,
        "affiliate_earned": 0.0,
        "order_count": 0,
        "paid_order_count": 0,
        "spend_currency": "USD",
        "current_plan": None,
        "membership_status": None,
        "last_purchase_at": None,
        "last_purchase_amount": None,
        "created_at": clean.get("created_at"),
    }


async def _student_summary_with_earnings(
    student: dict[str, Any],
    affiliate: dict[str, Any],
    affiliate_id: str,
) -> dict[str, Any]:
    summary = _student_summary(student, affiliate)
    student_id = summary.get("user_id")
    if not student_id:
        return summary

    stats = await payout_service.get_referral_stats(affiliate_id, student_id)
    if stats:
        summary["total_spent"] = stats["total_spent"]
        summary["affiliate_earned"] = stats["commission_earned"]
        summary["admin_earned"] = stats["admin_earned"]
        summary["order_count"] = stats["order_count"]
        summary["paid_order_count"] = stats["order_count"]
        summary["spend_currency"] = stats["currency"]
        summary["current_plan"] = stats.get("last_plan_type")
        summary["last_purchase_at"] = stats.get("last_purchase_at")
        summary["last_purchase_amount"] = stats.get("last_purchase_amount")
        return summary

    from services.routes.finance.service import student_commerce_from_item

    commerce = student_commerce_from_item(student, user_id=student_id)
    if not commerce["order_count"] and not commerce["total_spent"]:
        profile = await auth_service.get_user_by_id(student_id)
        commerce = student_commerce_from_item(profile, user_id=student_id)
    summary["total_spent"] = commerce["total_spent"]
    summary["admin_earned"] = commerce["admin_earned"]
    summary["affiliate_earned"] = commerce["affiliate_earned"]
    summary["order_count"] = commerce["order_count"]
    summary["paid_order_count"] = commerce["paid_order_count"]
    summary["spend_currency"] = commerce["currency"]
    summary["current_plan"] = commerce.get("current_plan")
    summary["membership_status"] = commerce.get("membership_status")
    summary["last_purchase_at"] = commerce.get("last_purchase_at")
    summary["last_purchase_amount"] = commerce.get("last_purchase_amount")
    return summary


async def list_referred_students(
    *,
    affiliate_id: str,
    page: int = 1,
    limit: int = 20,
    cursor: Optional[str] = None,
    sort: str = "newest",
    empty_orders: bool = False,
) -> dict[str, Any]:
    if page < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "page must be >= 1")
    if limit < 1 or limit > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "limit must be between 1 and 100")
    _ = cursor

    affiliate = await _get_affiliate(affiliate_id)
    newest_first = sort != "oldest"
    collected: list[dict[str, Any]] = []

    query_kwargs: dict[str, Any] = {
        "IndexName": "GSI2",
        "KeyConditionExpression": (
            Key("GSI2PK").eq(f"AFFILIATE#{affiliate_id}") & Key("GSI2SK").begins_with("USER#")
        ),
        "ScanIndexForward": not newest_first,
    }

    while len(collected) < 500:
        def _query(kw=dict(query_kwargs)):
            return _table().query(**kw)

        response = await run_sync(_query)
        for item in response.get("Items", []) or []:
            if item.get("role") != UserRole.STUDENT.value:
                continue
            collected.append(item)
            if len(collected) >= 500:
                break
        last_key = response.get("LastEvaluatedKey")
        if not last_key or len(collected) >= 500:
            break
        query_kwargs["ExclusiveStartKey"] = last_key

    summaries = await asyncio.gather(
        *[
            _student_summary_with_earnings(student, affiliate, affiliate_id)
            for student in collected
        ]
    )
    matching = list(summaries)
    if empty_orders:
        matching = [item for item in matching if int(item.get("order_count") or 0) == 0]
    matching.sort(
        key=lambda item: str(item.get("created_at") or ""),
        reverse=newest_first,
    )

    total = len(matching)
    start = (page - 1) * limit
    page_items = matching[start : start + limit]
    has_next = start + limit < total
    wallet = await payout_service.get_wallet(affiliate_id)

    return {
        "items": list(page_items),
        "pagination": build_pagination(
            page=page,
            limit=limit,
            total=total,
            has_next=has_next,
        ),
        "totals": {
            "student_count": _as_int(affiliate.get("student_count")) or total,
            "total_spent": wallet.get("order_volume") or 0,
            "affiliate_earned": wallet.get("total_earned") or 0,
            "currency": wallet.get("currency") or "USD",
        },
    }


def _as_money(value: Any) -> float:
    if value is None:
        return 0.0
    return round(float(value), 2)


def _next_milestone(total_earned: float) -> float:
    """Pick the next round target above earned for the UI meter."""
    steps = (50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000)
    for step in steps:
        if total_earned < step:
            return float(step)
    # Beyond the table — keep a headroom of ~20% rounded up to the next thousand.
    return float(((int(total_earned) // 1000) + 2) * 1000)


async def sum_affiliate_commission(
    affiliate_id: str,
    *,
    history_limit: int = 0,
) -> dict[str, Any]:
    """Sum paid commission for an affiliate. Optionally collect recent order rows."""
    query_kwargs: dict[str, Any] = {
        "IndexName": "GSI2",
        "KeyConditionExpression": (
            Key("GSI2PK").eq(f"AFFILIATE#{affiliate_id}") & Key("GSI2SK").begins_with("ORDER#")
        ),
        "ScanIndexForward": False,
    }

    total_earned = 0.0
    total_order_amount = 0.0
    order_count = 0
    currency = "USD"
    items: list[dict[str, Any]] = []

    while True:
        def _query(kw=query_kwargs):
            return _table().query(**kw)

        response = await run_sync(_query)
        for item in response.get("Items", []):
            entity = item.get("entity")
            if entity is not None and entity != "ORDER":
                continue
            status_value = str(item.get("status") or "").lower()
            if status_value and status_value != "paid":
                continue

            amount = _as_money(item.get("amount"))
            commission = _as_money(item.get("affiliate_commission"))
            total_order_amount += amount
            if commission > 0:
                total_earned += commission
            order_count += 1
            currency = str(item.get("currency") or currency)

            if history_limit and commission > 0 and len(items) < history_limit:
                pk = str(item.get("PK") or "")
                student_user_id = pk.removeprefix("USER#") if pk.startswith("USER#") else None
                items.append(
                    {
                        "order_id": item.get("order_id") or "",
                        "student_user_id": student_user_id,
                        "plan_type": item.get("plan_type"),
                        "item_kind": item.get("item_kind") or ("webinar" if item.get("webinar_id") else "plan"),
                        "webinar_id": item.get("webinar_id"),
                        "webinar_title": item.get("webinar_title"),
                        "amount": amount,
                        "commission": commission,
                        "currency": str(item.get("currency") or "USD"),
                        "status": status_value or "paid",
                        "created_at": item.get("created_at"),
                    }
                )

        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        query_kwargs["ExclusiveStartKey"] = last_key

    total_earned_rounded = round(total_earned, 2)
    total_order_rounded = round(total_order_amount, 2)
    return {
        "total_earned": total_earned_rounded,
        "total_order_amount": total_order_rounded,
        "admin_earned": round(total_order_rounded - total_earned_rounded, 2),
        "order_count": order_count,
        "currency": currency,
        "items": items,
    }


async def get_earnings(*, affiliate_id: str, history_limit: int = 25) -> dict[str, Any]:
    """Return stored wallet balances and recent commission ledger rows."""
    from services.routes.payout.service import get_payout_settings, get_wallet, list_commissions

    affiliate = await _get_affiliate(affiliate_id)
    margin = normalize_value(affiliate.get("margin_percent"))
    wallet = await get_wallet(affiliate_id)
    settings = await get_payout_settings()
    items = await list_commissions(affiliate_id, limit=history_limit)
    total_earned = round(wallet["total_earned"], 2)
    lock_amount = round(wallet["lock_amount"], 2)
    available = round(wallet["available"], 2)
    return {
        "total_earned": total_earned,
        "lock_amount": lock_amount,
        "available": available,
        "pending_payout": round(lock_amount + available, 2),
        "paid_out": round(wallet["paid_out"], 2),
        "currency": wallet["currency"],
        "order_count": wallet["order_count"],
        "payout_lock_days": settings["payout_lock_days"],
        "margin_percent": float(margin) if margin is not None else None,
        "next_milestone": _next_milestone(total_earned),
        "items": items,
    }
