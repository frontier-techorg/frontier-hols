"""Write-time money counters for students and the admin finance record."""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Optional

from core.async_io import run_sync
from database import get_table
from database_entities import AdminFinance, UserProfile, UserRole, now_iso
from services.common.pagination import normalize_value

logger = logging.getLogger(__name__)


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


def _clear_user_list_cache() -> None:
    try:
        from services.routes.users import service as users_service

        users_service.clear_user_list_cache()
    except Exception:
        logger.debug("Could not clear user list cache", exc_info=True)


def empty_admin_finance(currency: str = "USD") -> dict[str, Any]:
    return {
        "revenue": 0.0,
        "profit": 0.0,
        "affiliate_earned": 0.0,
        "affiliate_paid_out": 0.0,
        "affiliate_pending": 0.0,
        "affiliate_available": 0.0,
        "affiliate_lock": 0.0,
        "student_count": 0,
        "affiliate_count": 0,
        "order_count": 0,
        "currency": currency,
        "updated_at": None,
    }


def public_admin_finance(item: Optional[dict[str, Any]], *, currency: str = "USD") -> dict[str, Any]:
    if not item:
        return empty_admin_finance(currency)
    return {
        "revenue": round(_as_float(item.get("revenue")), 2),
        "profit": round(_as_float(item.get("profit")), 2),
        "affiliate_earned": round(_as_float(item.get("affiliate_earned")), 2),
        "affiliate_paid_out": round(_as_float(item.get("affiliate_paid_out")), 2),
        "affiliate_pending": round(_as_float(item.get("affiliate_pending")), 2),
        "affiliate_available": round(_as_float(item.get("affiliate_available")), 2),
        "affiliate_lock": round(_as_float(item.get("affiliate_lock")), 2),
        "student_count": _as_int(item.get("student_count")),
        "affiliate_count": _as_int(item.get("affiliate_count")),
        "order_count": _as_int(item.get("order_count")),
        "currency": item.get("currency") or currency,
        "updated_at": item.get("updated_at"),
    }


def student_commerce_from_item(user: Optional[dict[str, Any]], *, user_id: Optional[str] = None) -> dict[str, Any]:
    item = user or {}
    spent = round(_as_float(item.get("total_spent")), 2)
    admin_earned = round(_as_float(item.get("admin_earned")), 2)
    return {
        "user_id": item.get("user_id") or user_id or "",
        "total_spent": spent,
        "admin_earned": admin_earned,
        "affiliate_earned": round(max(spent - admin_earned, 0), 2),
        "order_count": _as_int(item.get("order_count")),
        "paid_order_count": _as_int(item.get("paid_order_count")),
        "currency": item.get("spend_currency") or "USD",
        "last_purchase_at": item.get("last_purchase_at"),
        "last_purchase_amount": (
            round(_as_float(item.get("last_purchase_amount")), 2)
            if item.get("last_purchase_amount") is not None
            else None
        ),
        "last_plan_type": item.get("last_plan_type"),
        "current_plan": item.get("current_plan"),
        "membership_status": item.get("membership_status"),
        "membership_end_date": item.get("membership_end_date"),
    }


async def increment_student_commerce(
    *,
    user_id: str,
    amount: float,
    admin_earned: float,
    currency: str,
    plan_type: str,
    paid_at: str,
    membership_status: Optional[str] = None,
    membership_end_date: Optional[str] = None,
    update_membership: bool = True,
) -> dict[str, Any]:
    """Add one paid order to the student profile and role index."""
    from services.routes.auth.service import user_role_index_item

    money = _as_decimal(round(float(amount or 0), 2))
    profit = _as_decimal(round(float(admin_earned or 0), 2))

    set_expression = (
        "SET spend_currency = :currency, last_purchase_at = :paid_at, "
        "last_purchase_amount = :amt"
    )
    values: dict[str, Any] = {
        ":amt": money,
        ":profit": profit,
        ":one": Decimal("1"),
        ":currency": currency,
        ":paid_at": paid_at,
    }
    if update_membership:
        set_expression += (
            ", last_plan_type = :plan, current_plan = :plan, "
            "membership_status = :status, membership_end_date = :end_date"
        )
        values[":plan"] = plan_type
        values[":status"] = membership_status or "active"
        values[":end_date"] = membership_end_date or ""

    def _update():
        response = _table().update_item(
            Key={"PK": UserProfile.pk(user_id), "SK": UserProfile.sk()},
            UpdateExpression=(
                "ADD total_spent :amt, admin_earned :profit, "
                "order_count :one, paid_order_count :one "
                + set_expression
            ),
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )
        updated = response["Attributes"]
        _table().put_item(Item=user_role_index_item(updated))
        return updated

    updated = await run_sync(_update)
    _clear_user_list_cache()
    logger.info(
        "Student commerce incremented user_id=%s amount=%s plan=%s",
        user_id,
        amount,
        plan_type,
    )
    return student_commerce_from_item(updated, user_id=user_id)


async def adjust_admin_finance(
    *,
    revenue: float = 0,
    profit: float = 0,
    affiliate_earned: float = 0,
    affiliate_paid_out: float = 0,
    affiliate_pending: float = 0,
    affiliate_available: float = 0,
    affiliate_lock: float = 0,
    student_count: int = 0,
    affiliate_count: int = 0,
    order_count: int = 0,
    currency: str = "USD",
) -> None:
    """ADD deltas onto the stored admin finance row. Skip a no-op update."""
    deltas = {
        "revenue": round(float(revenue or 0), 2),
        "profit": round(float(profit or 0), 2),
        "affiliate_earned": round(float(affiliate_earned or 0), 2),
        "affiliate_paid_out": round(float(affiliate_paid_out or 0), 2),
        "affiliate_pending": round(float(affiliate_pending or 0), 2),
        "affiliate_available": round(float(affiliate_available or 0), 2),
        "affiliate_lock": round(float(affiliate_lock or 0), 2),
        "student_count": int(student_count or 0),
        "affiliate_count": int(affiliate_count or 0),
        "order_count": int(order_count or 0),
    }
    if all(value == 0 for value in deltas.values()):
        return

    add_parts: list[str] = []
    values: dict[str, Any] = {
        ":now": now_iso(),
        ":entity": AdminFinance.ENTITY,
        ":currency": currency,
    }
    for index, (field, amount) in enumerate(deltas.items()):
        if amount == 0:
            continue
        token = f":d{index}"
        add_parts.append(f"{field} {token}")
        values[token] = _as_decimal(amount)

    def _update():
        return _table().update_item(
            Key={"PK": AdminFinance.pk(), "SK": AdminFinance.sk()},
            UpdateExpression=(
                "ADD " + ", ".join(add_parts) + " SET "
                "updated_at = :now, "
                "entity = if_not_exists(entity, :entity), "
                "currency = if_not_exists(currency, :currency)"
            ),
            ExpressionAttributeValues=values,
        )

    await run_sync(_update)
    logger.info("Admin finance adjusted deltas=%s", deltas)


async def _role_total(role: str) -> int:
    from services.routes.auth.service import user_role_count_key

    def _fetch():
        return _table().get_item(Key=user_role_count_key(role)).get("Item")

    item = await run_sync(_fetch)
    return _as_int((item or {}).get("total"))


async def _stored_order_total() -> int:
    from database_entities import SalesSnapshot

    def _fetch():
        return _table().get_item(
            Key={"PK": SalesSnapshot.admin_pk(), "SK": "TOTAL"}
        ).get("Item")

    item = await run_sync(_fetch)
    return _as_int((item or {}).get("sales_count"))


async def ensure_admin_counts(item: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Seed student/affiliate/order totals once from stored role and sales counters."""
    if item and item.get("counts_ready"):
        return item

    student_count = await _role_total(UserRole.STUDENT.value)
    affiliate_count = await _role_total(UserRole.AFFILIATE.value)
    order_count = await _stored_order_total()

    def _update():
        return _table().update_item(
            Key={"PK": AdminFinance.pk(), "SK": AdminFinance.sk()},
            UpdateExpression=(
                "SET student_count = :students, affiliate_count = :affiliates, "
                "order_count = :orders, counts_ready = :ready, "
                "entity = if_not_exists(entity, :entity), updated_at = :now"
            ),
            ExpressionAttributeValues={
                ":students": student_count,
                ":affiliates": affiliate_count,
                ":orders": order_count,
                ":ready": True,
                ":entity": AdminFinance.ENTITY,
                ":now": now_iso(),
            },
            ReturnValues="ALL_NEW",
        )

    updated = await run_sync(_update)
    seeded = updated.get("Attributes") or item or {}
    logger.info(
        "Admin counts seeded students=%s affiliates=%s orders=%s",
        student_count,
        affiliate_count,
        order_count,
    )
    return seeded


async def bump_admin_role_count(role: Optional[str], *, delta: int) -> None:
    if not delta:
        return
    if role == UserRole.STUDENT.value:
        await adjust_admin_finance(student_count=delta)
    elif role == UserRole.AFFILIATE.value:
        await adjust_admin_finance(affiliate_count=delta)


async def get_admin_finance() -> dict[str, Any]:
    def _fetch():
        return _table().get_item(Key={"PK": AdminFinance.pk(), "SK": AdminFinance.sk()}).get("Item")

    item = await run_sync(_fetch)
    if not item or not item.get("counts_ready"):
        try:
            item = await ensure_admin_counts(item)
        except Exception:
            logger.exception("Failed to seed admin student/affiliate/order counts")
    return public_admin_finance(item)


async def get_stored_student_commerce(user_id: str) -> dict[str, Any]:
    from services.routes.auth.service import get_user_by_id

    user = await get_user_by_id(user_id)
    if not user or user.get("role") != UserRole.STUDENT.value:
        return student_commerce_from_item(None, user_id=user_id)
    return student_commerce_from_item(user, user_id=user_id)
