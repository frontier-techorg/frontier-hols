"""Affiliate wallet, lock period, payouts, and dashboard — stored on write."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from core.async_io import run_sync
from database import get_table
from services.common.pagination import build_pagination
from database_entities import (
    DEFAULT_PAYOUT_LOCK_DAYS,
    AffiliateCommissionLedger,
    AffiliatePayout,
    AffiliatePayoutStatus,
    AffiliateReferralStats,
    AffiliateWallet,
    CommissionLock,
    PayoutSettings,
    now_iso,
)
from services.common.pagination import normalize_value

logger = logging.getLogger(__name__)

PROD_UNLOCK_INTERVAL_SECONDS = 3600
DEV_UNLOCK_INTERVAL_SECONDS = 15
DEV_UNLOCK_HOLD_SECONDS = 60
TIMESERIES_PERIODS = ("weekly", "monthly", "yearly")


def unlock_interval_seconds() -> float:
    from config import settings

    return float(DEV_UNLOCK_INTERVAL_SECONDS if settings.is_development() else PROD_UNLOCK_INTERVAL_SECONDS)


def payout_hold_seconds(lock_days: int) -> int:
    if lock_days <= 0:
        return 0
    from config import settings

    if settings.is_development():
        return DEV_UNLOCK_HOLD_SECONDS
    return int(lock_days) * 86400


def _with_hold_meta(payload: dict[str, Any], settings_row: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    row = settings_row or payload
    days = _as_int(row.get("payout_lock_days"), DEFAULT_PAYOUT_LOCK_DAYS)
    payload["payout_lock_days"] = days
    payload["payout_lock_seconds"] = payout_hold_seconds(days)
    return payload


def _table():
    return get_table()


def _as_decimal(value: float | Decimal | int) -> Decimal:
    return Decimal(str(value))


def _as_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    normalized = normalize_value(value)
    if normalized is None:
        return default
    return float(normalized)


def _as_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    normalized = normalize_value(value)
    if normalized is None:
        return default
    return int(normalized)


def empty_wallet(currency: str = "USD") -> dict[str, Any]:
    return {
        "total_earned": 0.0,
        "lock_amount": 0.0,
        "available": 0.0,
        "pending": 0.0,
        "paid_out": 0.0,
        "order_count": 0,
        "order_volume": 0.0,
        "currency": currency,
        "updated_at": None,
    }


def public_wallet(item: Optional[dict[str, Any]], *, currency: str = "USD") -> dict[str, Any]:
    if not item:
        return empty_wallet(currency)
    return {
        "total_earned": _as_float(item.get("total_earned")),
        "lock_amount": _as_float(item.get("lock_amount")),
        "available": _as_float(item.get("available")),
        "pending": _as_float(item.get("pending")),
        "paid_out": _as_float(item.get("paid_out")),
        "order_count": _as_int(item.get("order_count")),
        "order_volume": _as_float(item.get("order_volume")),
        "currency": item.get("currency") or currency,
        "updated_at": item.get("updated_at"),
    }


def wallet_reporting_fields(wallet: dict[str, Any]) -> dict[str, Any]:
    earned = round(wallet["total_earned"], 2)
    volume = round(wallet["order_volume"], 2)
    return {
        "total_earned": earned,
        "lock_amount": round(wallet["lock_amount"], 2),
        "available": round(wallet["available"], 2),
        "pending": round(wallet.get("pending") or 0, 2),
        "paid_out": round(wallet["paid_out"], 2),
        "total_order_amount": volume,
        "order_count": wallet["order_count"],
        "admin_earned": round(max(volume - earned, 0), 2),
        "earnings_currency": wallet["currency"],
    }


async def get_wallet(affiliate_id: str) -> dict[str, Any]:
    def _fetch():
        return _table().get_item(
            Key={"PK": AffiliateWallet.pk(affiliate_id), "SK": AffiliateWallet.sk()}
        ).get("Item")

    return public_wallet(await run_sync(_fetch))


def referral_stats_from_item(item: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not item:
        return None
    spent = _as_float(item.get("total_spent"))
    earned = _as_float(item.get("commission_earned"))
    stored_admin = item.get("admin_earned")
    admin_earned = (
        round(_as_float(stored_admin), 2)
        if stored_admin is not None
        else round(max(spent - earned, 0), 2)
    )
    return {
        "student_user_id": item.get("student_user_id"),
        "total_spent": spent,
        "commission_earned": earned,
        "admin_earned": admin_earned,
        "order_count": _as_int(item.get("order_count")),
        "currency": item.get("currency") or "USD",
        "last_plan_type": item.get("last_plan_type"),
        "last_purchase_at": item.get("last_purchase_at"),
        "last_purchase_amount": _as_float(item.get("last_purchase_amount")),
        "updated_at": item.get("updated_at"),
    }


async def get_referral_stats(affiliate_id: str, student_user_id: str) -> Optional[dict[str, Any]]:
    def _get():
        return _table().get_item(
            Key={
                "PK": AffiliateReferralStats.pk(affiliate_id),
                "SK": AffiliateReferralStats.sk(student_user_id),
            }
        )

    response = await run_sync(_get)
    return referral_stats_from_item(response.get("Item"))


async def increment_referral_stats(
    *,
    affiliate_id: str,
    student_user_id: str,
    commission: float | Decimal,
    order_amount: float | Decimal,
    currency: str,
    plan_type: Optional[str],
    paid_at: str,
) -> None:
    if not student_user_id:
        return
    money = _as_decimal(round(float(commission or 0), 2))
    volume = _as_decimal(round(float(order_amount or 0), 2))
    profit = _as_decimal(round(max(float(order_amount or 0) - float(commission or 0), 0), 2))

    def _update():
        return _table().update_item(
            Key={
                "PK": AffiliateReferralStats.pk(affiliate_id),
                "SK": AffiliateReferralStats.sk(student_user_id),
            },
            UpdateExpression=(
                "ADD commission_earned :amt, total_spent :volume, order_count :one, "
                "admin_earned :profit "
                "SET currency = :currency, updated_at = :now, "
                "entity = if_not_exists(entity, :entity), "
                "affiliate_id = if_not_exists(affiliate_id, :affiliate_id), "
                "student_user_id = if_not_exists(student_user_id, :student_id), "
                "last_plan_type = :plan, last_purchase_at = :paid_at, "
                "last_purchase_amount = :volume"
            ),
            ExpressionAttributeValues={
                ":amt": money,
                ":volume": volume,
                ":profit": profit,
                ":one": Decimal("1"),
                ":currency": currency,
                ":now": now_iso(),
                ":entity": AffiliateReferralStats.ENTITY,
                ":affiliate_id": affiliate_id,
                ":student_id": student_user_id,
                ":plan": plan_type or "",
                ":paid_at": paid_at,
            },
        )

    await run_sync(_update)


async def ensure_payout_settings() -> dict[str, Any]:
    existing = await get_payout_settings()
    if existing.get("payout_lock_days") is not None and existing.get("updated_at"):
        return existing
    settings = PayoutSettings(payout_lock_days=DEFAULT_PAYOUT_LOCK_DAYS)
    await run_sync(_table().put_item, Item=settings.to_item())
    return _with_hold_meta({
        "payout_lock_days": DEFAULT_PAYOUT_LOCK_DAYS,
        "updated_by": None,
        "updated_at": settings.updated_at,
    })


async def get_payout_settings() -> dict[str, Any]:
    def _fetch():
        return _table().get_item(Key={"PK": PayoutSettings.pk(), "SK": PayoutSettings.sk()}).get("Item")

    item = await run_sync(_fetch)
    if not item:
        return _with_hold_meta({
            "payout_lock_days": DEFAULT_PAYOUT_LOCK_DAYS,
            "updated_by": None,
            "updated_at": None,
        })
    return _with_hold_meta({
        "payout_lock_days": _as_int(item.get("payout_lock_days"), DEFAULT_PAYOUT_LOCK_DAYS),
        "updated_by": item.get("updated_by"),
        "updated_at": item.get("updated_at"),
    })


async def update_payout_settings(*, payout_lock_days: int, admin_user_id: str) -> dict[str, Any]:
    settings = PayoutSettings(
        payout_lock_days=payout_lock_days,
        updated_by=admin_user_id,
    )
    await run_sync(_table().put_item, Item=settings.to_item())
    logger.info(
        "Payout lock period set to %s days by admin_id=%s",
        payout_lock_days,
        admin_user_id,
    )
    return _with_hold_meta({
        "payout_lock_days": payout_lock_days,
        "updated_by": admin_user_id,
        "updated_at": settings.updated_at,
    })


async def credit_affiliate_commission(
    *,
    affiliate_id: str,
    order_id: str,
    commission: float | Decimal,
    order_amount: float | Decimal,
    currency: str,
    plan_type: Optional[str],
    paid_at: datetime | str,
    student_user_id: Optional[str] = None,
) -> None:
    """On each referred sale: add to total earned and lock (or available if hold is 0)."""
    amount = round(float(commission or 0), 2)
    volume = round(float(order_amount or 0), 2)
    if amount <= 0:
        return

    if isinstance(paid_at, str):
        paid_at_dt = datetime.fromisoformat(paid_at.replace("Z", "+00:00"))
    else:
        paid_at_dt = paid_at
    if paid_at_dt.tzinfo is None:
        paid_at_dt = paid_at_dt.replace(tzinfo=timezone.utc)

    settings = await get_payout_settings()
    lock_days = max(int(settings.get("payout_lock_days") or 0), 0)
    hold_seconds = int(settings.get("payout_lock_seconds") or payout_hold_seconds(lock_days))
    locked_at = paid_at_dt.astimezone(timezone.utc).isoformat()
    immediate = hold_seconds <= 0
    unlock_at = None if immediate else (paid_at_dt + timedelta(seconds=hold_seconds)).astimezone(timezone.utc).isoformat()
    money = _as_decimal(amount)
    volume_dec = _as_decimal(volume)

    add_parts = [
        "total_earned :amt",
        "order_count :one",
        "order_volume :volume",
        "paid_out :zero",
        "pending :zero",
    ]
    if immediate:
        add_parts.append("available :amt")
        add_parts.append("lock_amount :zero")
        ledger_status = "available"
    else:
        add_parts.append("lock_amount :amt")
        add_parts.append("available :zero")
        ledger_status = "locked"

    def _credit_wallet():
        return _table().update_item(
            Key={"PK": AffiliateWallet.pk(affiliate_id), "SK": AffiliateWallet.sk()},
            UpdateExpression=(
                "ADD " + ", ".join(add_parts) + " SET "
                "currency = :currency, updated_at = :now, "
                "entity = if_not_exists(entity, :entity), "
                "user_id = if_not_exists(user_id, :user_id)"
            ),
            ExpressionAttributeValues={
                ":amt": money,
                ":one": Decimal("1"),
                ":volume": volume_dec,
                ":zero": Decimal("0"),
                ":currency": currency,
                ":now": now_iso(),
                ":entity": AffiliateWallet.ENTITY,
                ":user_id": affiliate_id,
            },
        )

    await run_sync(_credit_wallet)

    if student_user_id:
        try:
            await increment_referral_stats(
                affiliate_id=affiliate_id,
                student_user_id=student_user_id,
                commission=amount,
                order_amount=volume,
                currency=currency,
                plan_type=plan_type,
                paid_at=locked_at,
            )
        except Exception:
            logger.exception(
                "Failed to increment referral stats affiliate_id=%s student_id=%s order_id=%s",
                affiliate_id,
                student_user_id,
                order_id,
            )

    ledger = AffiliateCommissionLedger(
        user_id=affiliate_id,
        order_id=order_id,
        amount=amount,
        order_amount=volume,
        currency=currency,
        plan_type=plan_type,
        status=ledger_status,
        unlock_at=unlock_at,
        created_at=locked_at,
    )
    await run_sync(_table().put_item, Item=ledger.to_item())

    if not immediate and unlock_at:
        lock = CommissionLock(
            affiliate_id=affiliate_id,
            order_id=order_id,
            amount=amount,
            currency=currency,
            locked_at=locked_at,
            unlock_at=unlock_at,
            plan_type=plan_type,
        )
        await run_sync(_table().put_item, Item=lock.to_item())

    logger.info(
        "Credited affiliate wallet affiliate_id=%s order_id=%s amount=%s hold_seconds=%s",
        affiliate_id,
        order_id,
        amount,
        hold_seconds,
    )
    try:
        from services.routes.finance.service import adjust_admin_finance

        await adjust_admin_finance(
            affiliate_earned=amount,
            affiliate_available=amount if immediate else 0,
            affiliate_lock=0 if immediate else amount,
            currency=currency,
        )
    except Exception:
        logger.exception(
            "Failed to update admin finance after commission affiliate_id=%s order_id=%s",
            affiliate_id,
            order_id,
        )


async def _list_due_locks(now: str) -> list[dict[str, Any]]:
    query_kwargs: dict[str, Any] = {
        "KeyConditionExpression": (
            Key("PK").eq(CommissionLock.pending_pk()) & Key("SK").lte(f"{now}\uffff")
        ),
    }
    items: list[dict[str, Any]] = []
    while True:
        def _query(kw=query_kwargs):
            return _table().query(**kw)

        response = await run_sync(_query)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        query_kwargs["ExclusiveStartKey"] = last_key
    return items


async def _release_lock(item: dict[str, Any]) -> bool:
    affiliate_id = str(item.get("affiliate_id") or "")
    order_id = str(item.get("order_id") or "")
    amount = _as_float(item.get("amount"))
    if not affiliate_id or amount <= 0:
        return False

    table = _table()
    table_name = table.name
    money = _as_decimal(amount)
    now = now_iso()
    created_at = str(item.get("locked_at") or item.get("created_at") or "")

    transact_items: list[dict[str, Any]] = [
        {
            "Delete": {
                "TableName": table_name,
                "Key": {"PK": item["PK"], "SK": item["SK"]},
                "ConditionExpression": "attribute_exists(PK)",
            }
        },
        {
            "Update": {
                "TableName": table_name,
                "Key": {
                    "PK": AffiliateWallet.pk(affiliate_id),
                    "SK": AffiliateWallet.sk(),
                },
                "UpdateExpression": (
                    "ADD lock_amount :neg, available :pos "
                    "SET updated_at = :now, entity = if_not_exists(entity, :entity)"
                ),
                "ExpressionAttributeValues": {
                    ":neg": _as_decimal(-amount),
                    ":pos": money,
                    ":now": now,
                    ":entity": AffiliateWallet.ENTITY,
                },
            }
        },
    ]

    def _commit():
        table.meta.client.transact_write_items(TransactItems=transact_items)

    try:
        await run_sync(_commit)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"ConditionalCheckFailedException", "TransactionCanceledException"}:
            logger.info("Skip already-released lock order_id=%s affiliate_id=%s", order_id, affiliate_id)
            return False
        raise

    if created_at:
        def _mark_ledger():
            return table.update_item(
                Key={
                    "PK": AffiliateCommissionLedger.pk(affiliate_id),
                    "SK": AffiliateCommissionLedger.sk(created_at, order_id),
                },
                UpdateExpression="SET #status = :available",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={":available": "available"},
            )

        try:
            await run_sync(_mark_ledger)
        except ClientError:
            logger.exception(
                "Released lock but could not mark ledger available order_id=%s affiliate_id=%s",
                order_id,
                affiliate_id,
            )
    try:
        from services.routes.finance.service import adjust_admin_finance

        await adjust_admin_finance(
            affiliate_lock=-amount,
            affiliate_available=amount,
            currency=str(item.get("currency") or "USD"),
        )
    except Exception:
        logger.exception(
            "Released lock but could not update admin finance order_id=%s affiliate_id=%s",
            order_id,
            affiliate_id,
        )
    try:
        from services.notification import events as notify_events

        notify_events.lock_released(
            affiliate_id=affiliate_id,
            amount=amount,
            currency=str(item.get("currency") or "USD"),
            order_id=order_id,
        )
    except Exception:
        logger.exception("Failed to queue lock-release notification order_id=%s", order_id)
    return True


async def release_due_locks() -> int:
    """Move due lock amounts into available. Intended for the hourly worker."""
    due = await _list_due_locks(now_iso())
    released = 0
    for item in due:
        if await _release_lock(item):
            released += 1
    if released:
        logger.info("Released %s affiliate lock(s) into available", released)
    return released


async def list_commissions(affiliate_id: str, *, limit: int = 25) -> list[dict[str, Any]]:
    query_kwargs: dict[str, Any] = {
        "KeyConditionExpression": (
            Key("PK").eq(AffiliateCommissionLedger.pk(affiliate_id))
            & Key("SK").begins_with("COMMISSION#")
        ),
        "ScanIndexForward": False,
        "Limit": max(limit, 1),
    }

    def _query():
        return _table().query(**query_kwargs)

    response = await run_sync(_query)
    items = []
    for item in response.get("Items", []):
        items.append(
            {
                "order_id": item.get("order_id") or "",
                "plan_type": item.get("plan_type"),
                "amount": _as_float(item.get("order_amount")),
                "commission": _as_float(item.get("amount")),
                "currency": item.get("currency") or "USD",
                "status": item.get("status") or "locked",
                "created_at": item.get("created_at"),
                "unlock_at": item.get("unlock_at"),
            }
        )
    return items


def public_payout(item: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not item:
        return {
            "payout_id": "",
            "affiliate_id": "",
            "affiliate_name": "",
            "affiliate_email": "",
            "amount": 0.0,
            "currency": "USD",
            "status": AffiliatePayoutStatus.PENDING.value,
            "created_at": None,
            "reviewed_at": None,
            "reviewed_by": None,
        }
    return {
        "payout_id": item.get("payout_id") or "",
        "affiliate_id": item.get("affiliate_id") or item.get("user_id") or "",
        "affiliate_name": item.get("affiliate_name") or "",
        "affiliate_email": item.get("affiliate_email") or "",
        "amount": _as_float(item.get("amount")),
        "currency": item.get("currency") or "USD",
        "status": item.get("status") or AffiliatePayoutStatus.PENDING.value,
        "created_at": item.get("created_at"),
        "reviewed_at": item.get("reviewed_at"),
        "reviewed_by": item.get("reviewed_by"),
    }


async def _query_pk(pk: str, *, limit: Optional[int] = None, scan_forward: bool = False) -> list[dict[str, Any]]:
    query_kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(pk),
        "ScanIndexForward": scan_forward,
    }
    if limit is not None:
        query_kwargs["Limit"] = max(limit, 1)

    items: list[dict[str, Any]] = []
    while True:
        def _query(kw=query_kwargs):
            return _table().query(**kw)

        response = await run_sync(_query)
        items.extend(response.get("Items", []))
        if limit is not None:
            break
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        query_kwargs["ExclusiveStartKey"] = last_key
    return items


async def list_payouts(affiliate_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
    query_kwargs: dict[str, Any] = {
        "KeyConditionExpression": (
            Key("PK").eq(AffiliatePayout.pk(affiliate_id)) & Key("SK").begins_with("PAYOUT#")
        ),
        "ScanIndexForward": False,
        "Limit": max(limit, 1),
    }

    def _query():
        return _table().query(**query_kwargs)

    response = await run_sync(_query)
    return [public_payout(item) for item in response.get("Items", [])]


async def request_payout(*, affiliate_id: str, amount: Optional[float] = None) -> dict[str, Any]:
    from services.routes.auth.service import get_user_by_id

    wallet = await get_wallet(affiliate_id)
    available = round(wallet["available"], 2)
    payout_amount = round(float(amount), 2) if amount is not None else available
    if payout_amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No available balance to pay out")
    if payout_amount > available:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Requested amount exceeds available balance")

    user = await get_user_by_id(affiliate_id) or {}
    first = str(user.get("first_name") or "").strip()
    last = str(user.get("last_name") or "").strip()
    name = " ".join(part for part in (first, last) if part) or str(user.get("email") or affiliate_id)
    email = str(user.get("email") or "")

    payout_id = uuid.uuid4().hex
    created_at = now_iso()
    payout = AffiliatePayout(
        user_id=affiliate_id,
        payout_id=payout_id,
        amount=payout_amount,
        currency=wallet["currency"],
        status=AffiliatePayoutStatus.PENDING,
        affiliate_name=name,
        affiliate_email=email,
        created_at=created_at,
    )
    table = _table()
    table_name = table.name
    money = _as_decimal(payout_amount)

    def _commit():
        table.meta.client.transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": table_name,
                        "Key": {
                            "PK": AffiliateWallet.pk(affiliate_id),
                            "SK": AffiliateWallet.sk(),
                        },
                        "UpdateExpression": (
                            "ADD available :neg, pending :pos SET updated_at = :now"
                        ),
                        "ConditionExpression": "available >= :pos",
                        "ExpressionAttributeValues": {
                            ":neg": _as_decimal(-payout_amount),
                            ":pos": money,
                            ":now": created_at,
                        },
                    }
                },
                {"Put": {"TableName": table_name, "Item": payout.to_item()}},
                {"Put": {"TableName": table_name, "Item": payout.lookup_item()}},
                {"Put": {"TableName": table_name, "Item": payout.queue_item(pending=True)}},
                {"Put": {"TableName": table_name, "Item": payout.queue_item(pending=False)}},
            ]
        )

    try:
        await run_sync(_commit)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"ConditionalCheckFailedException", "TransactionCanceledException"}:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Available balance changed. Refresh and try again.",
            ) from exc
        raise

    logger.info(
        "Affiliate payout requested affiliate_id=%s payout_id=%s amount=%s",
        affiliate_id,
        payout_id,
        payout_amount,
    )
    try:
        from services.routes.finance.service import adjust_admin_finance

        await adjust_admin_finance(
            affiliate_available=-payout_amount,
            affiliate_pending=payout_amount,
            currency=wallet["currency"],
        )
    except Exception:
        logger.exception(
            "Failed to update admin finance after payout request payout_id=%s",
            payout_id,
        )
    try:
        from services.notification import events as notify_events

        notify_events.payout_requested(
            affiliate={**user, "user_id": affiliate_id, "email": email or user.get("email")},
            amount=payout_amount,
            currency=wallet["currency"],
            payout_id=payout_id,
            requested_at=created_at,
        )
    except Exception:
        logger.exception("Failed to queue payout-request notification payout_id=%s", payout_id)
    updated = await get_wallet(affiliate_id)
    return {
        "payout": public_payout(payout.to_item()),
        "wallet": updated,
    }


async def list_admin_payouts(*, page: int = 1, limit: int = 15) -> dict[str, Any]:
    if page < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "page must be >= 1")
    if limit < 1 or limit > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "limit must be between 1 and 100")

    raw_items = await _query_pk(AffiliatePayout.all_pk())
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    for item in raw_items:
        public = public_payout(item)
        payout_id = str(public.get("payout_id") or "")
        if not payout_id or payout_id in seen:
            continue
        seen.add(payout_id)
        rows.append(public)

    pending_status = AffiliatePayoutStatus.PENDING.value
    rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    rows.sort(key=lambda row: 0 if row.get("status") == pending_status else 1)

    total = len(rows)
    start_index = (page - 1) * limit
    page_rows = rows[start_index : start_index + limit]
    rejected_count = sum(
        1 for row in rows if row.get("status") == AffiliatePayoutStatus.REJECTED.value
    )
    pending_count = sum(1 for row in rows if row.get("status") == pending_status)
    from services.routes.finance.service import get_admin_finance

    finance = await get_admin_finance()
    currency = finance.get("currency") or (page_rows[0]["currency"] if page_rows else "USD")
    return {
        "items": page_rows,
        "pagination": build_pagination(
            page=page,
            limit=limit,
            total=total,
            has_next=start_index + limit < total,
        ),
        "pending_count": pending_count,
        "pending_amount": finance["affiliate_pending"],
        "paid_amount": finance["affiliate_paid_out"],
        "rejected_count": rejected_count,
        "currency": currency,
    }


async def review_payout(
    *,
    payout_id: str,
    action: str,
    admin_user_id: str,
) -> dict[str, Any]:
    decision = action.strip().lower()
    if decision not in {"accept", "reject"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "action must be accept or reject")

    def _lookup():
        return _table().get_item(
            Key={"PK": AffiliatePayout.lookup_pk(payout_id), "SK": AffiliatePayout.lookup_sk()}
        ).get("Item")

    lookup = await run_sync(_lookup)
    if not lookup:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payout request not found")

    current_status = str(lookup.get("status") or "")
    if current_status != AffiliatePayoutStatus.PENDING.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "This payout request was already reviewed.")

    affiliate_id = str(lookup.get("affiliate_id") or lookup.get("user_id") or "")
    created_at = str(lookup.get("created_at") or "")
    amount = round(_as_float(lookup.get("amount")), 2)
    if not affiliate_id or not created_at or amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payout request is incomplete")

    next_status = (
        AffiliatePayoutStatus.PAID.value if decision == "accept" else AffiliatePayoutStatus.REJECTED.value
    )
    reviewed_at = now_iso()
    table = _table()
    table_name = table.name
    money = _as_decimal(amount)
    wallet_add = (
        "ADD pending :neg, paid_out :pos SET updated_at = :now"
        if decision == "accept"
        else "ADD pending :neg, available :pos SET updated_at = :now"
    )
    status_update = (
        "SET #status = :next, reviewed_at = :now, reviewed_by = :admin"
    )

    def _commit():
        table.meta.client.transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": table_name,
                        "Key": {
                            "PK": AffiliateWallet.pk(affiliate_id),
                            "SK": AffiliateWallet.sk(),
                        },
                        "UpdateExpression": wallet_add,
                        "ConditionExpression": "pending >= :pos",
                        "ExpressionAttributeValues": {
                            ":neg": _as_decimal(-amount),
                            ":pos": money,
                            ":now": reviewed_at,
                        },
                    }
                },
                {
                    "Update": {
                        "TableName": table_name,
                        "Key": {
                            "PK": AffiliatePayout.pk(affiliate_id),
                            "SK": AffiliatePayout.sk(created_at, payout_id),
                        },
                        "UpdateExpression": status_update,
                        "ConditionExpression": "#status = :pending",
                        "ExpressionAttributeNames": {"#status": "status"},
                        "ExpressionAttributeValues": {
                            ":next": next_status,
                            ":pending": AffiliatePayoutStatus.PENDING.value,
                            ":now": reviewed_at,
                            ":admin": admin_user_id,
                        },
                    }
                },
                {
                    "Update": {
                        "TableName": table_name,
                        "Key": {
                            "PK": AffiliatePayout.lookup_pk(payout_id),
                            "SK": AffiliatePayout.lookup_sk(),
                        },
                        "UpdateExpression": status_update,
                        "ConditionExpression": "#status = :pending",
                        "ExpressionAttributeNames": {"#status": "status"},
                        "ExpressionAttributeValues": {
                            ":next": next_status,
                            ":pending": AffiliatePayoutStatus.PENDING.value,
                            ":now": reviewed_at,
                            ":admin": admin_user_id,
                        },
                    }
                },
                {
                    "Update": {
                        "TableName": table_name,
                        "Key": {
                            "PK": AffiliatePayout.all_pk(),
                            "SK": AffiliatePayout.queue_sk(created_at, affiliate_id, payout_id),
                        },
                        "UpdateExpression": status_update,
                        "ConditionExpression": "#status = :pending",
                        "ExpressionAttributeNames": {"#status": "status"},
                        "ExpressionAttributeValues": {
                            ":next": next_status,
                            ":pending": AffiliatePayoutStatus.PENDING.value,
                            ":now": reviewed_at,
                            ":admin": admin_user_id,
                        },
                    }
                },
                {
                    "Delete": {
                        "TableName": table_name,
                        "Key": {
                            "PK": AffiliatePayout.pending_pk(),
                            "SK": AffiliatePayout.queue_sk(created_at, affiliate_id, payout_id),
                        },
                        "ConditionExpression": "attribute_exists(PK)",
                    }
                },
            ]
        )

    try:
        await run_sync(_commit)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"ConditionalCheckFailedException", "TransactionCanceledException"}:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "This payout request was already reviewed.",
            ) from exc
        raise

    logger.info(
        "Affiliate payout %s payout_id=%s affiliate_id=%s amount=%s admin_id=%s",
        decision,
        payout_id,
        affiliate_id,
        amount,
        admin_user_id,
    )
    try:
        from services.routes.finance.service import adjust_admin_finance

        currency = str(lookup.get("currency") or "USD")
        if decision == "accept":
            await adjust_admin_finance(
                affiliate_pending=-amount,
                affiliate_paid_out=amount,
                currency=currency,
            )
        else:
            await adjust_admin_finance(
                affiliate_pending=-amount,
                affiliate_available=amount,
                currency=currency,
            )
    except Exception:
        logger.exception("Failed to update admin finance after payout %s payout_id=%s", decision, payout_id)

    try:
        from services.notification import events as notify_events

        notify_events.payout_reviewed(
            affiliate_id=affiliate_id,
            amount=amount,
            currency=str(lookup.get("currency") or "USD"),
            payout_id=payout_id,
            accepted=decision == "accept",
            reviewed_at=reviewed_at,
        )
    except Exception:
        logger.exception("Failed to queue payout-review notification payout_id=%s", payout_id)

    def _fetch():
        return table.get_item(
            Key={"PK": AffiliatePayout.pk(affiliate_id), "SK": AffiliatePayout.sk(created_at, payout_id)}
        ).get("Item")

    updated = public_payout(await run_sync(_fetch))
    return {"payout": updated}


async def get_payout_overview(affiliate_id: str) -> dict[str, Any]:
    from services.routes.auth.service import get_user_by_id

    settings = await get_payout_settings()
    wallet = await get_wallet(affiliate_id)
    payouts = await list_payouts(affiliate_id)
    affiliate = await get_user_by_id(affiliate_id) or {}
    return {
        "wallet": wallet,
        "payout_lock_days": settings["payout_lock_days"],
        "payout_lock_seconds": settings["payout_lock_seconds"],
        "student_count": _as_int(affiliate.get("student_count")),
        "payouts": payouts,
    }


async def get_affiliate_dashboard(*, affiliate_id: str, period: str) -> dict[str, Any]:
    if period not in TIMESERIES_PERIODS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "period must be weekly, monthly, or yearly")

    from services.routes.auth.service import get_user_by_id
    from services.routes.sales.service import get_sales_period_series

    affiliate = await get_user_by_id(affiliate_id)
    if not affiliate:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Affiliate not found")

    settings = await get_payout_settings()
    wallet = await get_wallet(affiliate_id)
    series = await get_sales_period_series(affiliate_id=affiliate_id, period=period)
    commissions = await list_commissions(affiliate_id, limit=6)
    margin = normalize_value(affiliate.get("margin_percent"))
    return {
        "period": period,
        "wallet": wallet,
        "payout_lock_days": settings["payout_lock_days"],
        "payout_lock_seconds": settings["payout_lock_seconds"],
        "timeseries": {
            "period": series["period"],
            "currency": series["currency"],
            "current": series["current"],
            "series": series["series"],
        },
        "totals": series["totals"],
        "recent_commissions": commissions,
        "margin_percent": float(margin) if margin is not None else None,
        "student_count": _as_int(affiliate.get("student_count")),
        "invite_code": affiliate.get("invite_code"),
        "currency": wallet["currency"],
    }


async def run_unlock_loop(stop_event) -> None:
    """Release due locks immediately, then poll until stopped."""
    import asyncio

    interval = unlock_interval_seconds()
    logger.info("Affiliate lock release worker interval=%ss", interval)
    while not stop_event.is_set():
        try:
            await release_due_locks()
        except Exception:
            logger.exception("Affiliate lock release worker failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue
