"""Payment service — plans, purchases, orders."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from boto3.dynamodb.conditions import Key
from fastapi import HTTPException, status

from core.async_io import run_sync
from database import get_table
from database_entities import (
    DEFAULT_PLAN_PRICES,
    Membership,
    MembershipStatus,
    Order,
    OrderStatus,
    Plan,
    PlanType,
    PLAN_DURATIONS,
    UserRole,
    now_iso,
)
from models.common import ErrorCodes
from services.common.pagination import (
    build_pagination,
    consume_query_page,
    decode_cursor,
    encode_cursor,
    exclusive_start_key,
    normalize_value,
    resolve_has_next,
)
from services.common.payment_gateway import (
    CardChargeRequest,
    process_card_charge,
)
from services.routes.auth.service import get_user_by_id

logger = logging.getLogger(__name__)


def _table():
    return get_table()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_default_plans() -> None:
    for plan_type in PlanType:
        existing = await get_plan(plan_type)
        if existing:
            continue
        plan = Plan(
            plan_type=plan_type,
            price=DEFAULT_PLAN_PRICES[plan_type.value],
            currency="USD",
            duration_days=PLAN_DURATIONS[plan_type.value],
        )
        item = plan.to_item()
        await run_sync(_table().put_item, Item=item)


async def get_plan(plan_type: PlanType) -> Optional[dict[str, Any]]:
    def _fetch():
        response = _table().get_item(
            Key={"PK": Plan.pk(plan_type.value), "SK": Plan.sk()},
        )
        return response.get("Item")

    return await run_sync(_fetch)


async def list_plans() -> list[dict[str, Any]]:
    await ensure_default_plans()
    plans: list[dict[str, Any]] = []
    for plan_type in PlanType:
        item = await get_plan(plan_type)
        if not item:
            continue
        plans.append(
            {
                "plan_type": item.get("plan_type"),
                "price": normalize_value(item.get("price")),
                "currency": item.get("currency", "USD"),
                "duration_days": int(item.get("duration_days", 0)),
                "updated_by": item.get("updated_by"),
                "updated_at": item.get("updated_at"),
            }
        )
    return plans


async def update_plan_price(
    plan_type: PlanType,
    price: float,
    admin_user_id: str,
) -> dict[str, Any]:
    if price <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Plan price must be greater than zero")

    await ensure_default_plans()
    plan = await get_plan(plan_type)
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")

    def _update():
        response = _table().update_item(
            Key={"PK": Plan.pk(plan_type.value), "SK": Plan.sk()},
            UpdateExpression="SET price = :price, updated_by = :updated_by, updated_at = :updated_at",
            ExpressionAttributeValues={
                ":price": Decimal(str(price)),
                ":updated_by": admin_user_id,
                ":updated_at": now_iso(),
            },
            ReturnValues="ALL_NEW",
        )
        return response["Attributes"]

    item = await run_sync(_update)
    logger.info("Plan %s price updated by admin=%s", plan_type.value, admin_user_id)
    return {
        "plan_type": item.get("plan_type"),
        "price": normalize_value(item.get("price")),
        "currency": item.get("currency", "USD"),
        "duration_days": int(item.get("duration_days", 0)),
        "updated_by": item.get("updated_by"),
        "updated_at": item.get("updated_at"),
    }


def _parse_iso_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def has_active_membership(membership: Optional[dict[str, Any]]) -> bool:
    """True when the student has a non-expired active membership."""
    if not membership:
        return False
    status_value = str(membership.get("status") or "").lower()
    if status_value != MembershipStatus.ACTIVE.value:
        return False
    end_date = membership.get("end_date")
    if not end_date:
        return False
    try:
        expires_at = _parse_iso_datetime(str(end_date))
    except ValueError:
        return False
    return expires_at > _utcnow()


async def get_membership(user_id: str) -> Optional[dict[str, Any]]:
    def _fetch():
        response = _table().get_item(
            Key={"PK": Membership.pk(user_id), "SK": Membership.sk()},
        )
        return response.get("Item")

    item = await run_sync(_fetch)
    if not item:
        return None
    plan = await get_plan(PlanType(item["plan_type"]))
    return {
        "plan_type": item.get("plan_type"),
        "status": item.get("status"),
        "start_date": item.get("start_date"),
        "end_date": item.get("end_date"),
        "order_id": item.get("order_id"),
        "plan_price": normalize_value(plan.get("price")) if plan else None,
        "currency": plan.get("currency", "USD") if plan else "USD",
        "duration_days": int(plan.get("duration_days", 0)) if plan else 0,
    }


async def _count_orders(user_id: str) -> int:
    total = 0
    kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(Membership.pk(user_id))
        & Key("SK").begins_with("ORDER#"),
        "Select": "COUNT",
    }
    while True:
        def _count(kw=kwargs):
            return _table().query(**kw)

        response = await run_sync(_count)
        total += response.get("Count", 0)
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return total


def _public_order_item(item: dict[str, Any], *, include_affiliate: bool = False) -> dict[str, Any]:
    row = {
        "order_id": item.get("order_id"),
        "plan_type": item.get("plan_type"),
        "item_kind": item.get("item_kind") or ("webinar" if item.get("webinar_id") else "plan"),
        "webinar_id": item.get("webinar_id"),
        "webinar_title": item.get("webinar_title"),
        "amount": normalize_value(item.get("amount")),
        "currency": item.get("currency", "USD"),
        "status": item.get("status"),
        "payment_method_id": item.get("payment_method_id"),
        "created_at": item.get("created_at"),
        "gateway_transaction_id": item.get("gateway_transaction_id"),
        "payment_processor": item.get("payment_processor"),
    }
    if include_affiliate:
        row["affiliate_id"] = item.get("affiliate_id")
        commission = normalize_value(item.get("affiliate_commission"))
        row["affiliate_commission"] = commission
        profit = normalize_value(item.get("platform_profit"))
        if profit is None:
            amount = float(row.get("amount") or 0)
            profit = round(amount - float(commission or 0), 2)
        row["platform_profit"] = profit
    return row


async def sum_student_spend(user_id: str) -> dict[str, Any]:
    """Stored student commerce. Kept as a named helper for older call sites."""
    from services.routes.finance.service import get_stored_student_commerce

    commerce = await get_stored_student_commerce(user_id)
    return {
        "total_spent": commerce["total_spent"],
        "admin_earned": commerce["admin_earned"],
        "order_count": commerce["order_count"],
        "paid_order_count": commerce["paid_order_count"],
        "currency": commerce["currency"],
        "last_purchase_at": commerce["last_purchase_at"],
        "last_purchase_amount": commerce["last_purchase_amount"],
        "last_plan_type": commerce["last_plan_type"],
    }


async def get_student_commerce_summary(user_id: str) -> dict[str, Any]:
    """Spend + membership snapshot stored on the student profile."""
    from services.routes.finance.service import get_stored_student_commerce

    user = await get_user_by_id(user_id)
    if not user or user.get("role") != UserRole.STUDENT.value:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")

    commerce = await get_stored_student_commerce(user_id)
    membership = await get_membership(user_id)
    if membership:
        commerce["current_plan"] = membership.get("plan_type") or commerce.get("current_plan")
        commerce["membership_status"] = membership.get("status") or commerce.get("membership_status")
        commerce["membership_end_date"] = membership.get("end_date") or commerce.get("membership_end_date")
    return commerce


async def list_orders(
    user_id: str,
    page: int = 1,
    limit: int = 20,
    cursor: Optional[str] = None,
    *,
    include_affiliate: bool = False,
) -> dict[str, Any]:
    if page < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "page must be >= 1")
    if limit < 1 or limit > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "limit must be between 1 and 100")

    total = await _count_orders(user_id)
    start_index = (page - 1) * limit
    raw_items: list[dict[str, Any]] = []
    skipped = 0
    dynamo_has_next = False
    next_cursor: Optional[str] = None

    query_kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(Membership.pk(user_id))
        & Key("SK").begins_with("ORDER#"),
        "ScanIndexForward": False,
    }
    start_key = decode_cursor(cursor)
    if start_key:
        query_kwargs["ExclusiveStartKey"] = start_key

    while len(raw_items) < limit:
        def _query(kw=query_kwargs):
            return _table().query(**kw)

        response = await run_sync(_query)
        items = response.get("Items", []) or []
        last_key = response.get("LastEvaluatedKey")
        skipped, page_full, page_has_next = consume_query_page(
            items,
            start_index=start_index,
            skipped=skipped,
            collected=raw_items,
            limit=limit,
            last_key=last_key,
        )
        if page_full:
            dynamo_has_next = page_has_next
            next_cursor = encode_cursor(exclusive_start_key(raw_items[-1]))
            break
        if not last_key:
            break
        query_kwargs["ExclusiveStartKey"] = last_key

    has_next = resolve_has_next(
        page=page,
        limit=limit,
        total=total,
        collected=len(raw_items),
        dynamo_has_next=dynamo_has_next,
    )
    return {
        "items": [
            _public_order_item(item, include_affiliate=include_affiliate) for item in raw_items
        ],
        "pagination": build_pagination(
            page=page,
            limit=limit,
            total=total,
            has_next=has_next,
            next_cursor=next_cursor,
        ),
    }


async def get_order(user_id: str, order_id: str) -> dict[str, Any]:
    """Return one of the student's orders for the invoice view."""
    needle = str(order_id or "").strip()
    if not needle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")

    query_kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(Membership.pk(user_id))
        & Key("SK").begins_with("ORDER#"),
    }
    while True:
        def _query(kw=query_kwargs):
            return _table().query(**kw)

        response = await run_sync(_query)
        for item in response.get("Items") or []:
            if str(item.get("order_id") or "") == needle:
                return _public_order_item(item)
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        query_kwargs["ExclusiveStartKey"] = last_key

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")


async def purchase_plan(
    user_id: str,
    plan_type: PlanType,
) -> dict[str, Any]:
    user = await get_user_by_id(user_id)
    if not user or user.get("role") != UserRole.STUDENT.value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only students can purchase plans")

    await ensure_default_plans()
    plan = await get_plan(plan_type)
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")

    amount = normalize_value(plan.get("price"))
    order_id = uuid.uuid4().hex
    created_at = now_iso()
    affiliate_id = user.get("referred_by_affiliate_id")
    affiliate_commission = None
    affiliate = None
    previous = await get_membership(user_id)
    previous_plan = str(previous.get("plan_type") or "") if previous else ""
    plan_changed = bool(previous_plan) and previous_plan != plan_type.value

    if affiliate_id:
        affiliate = await get_user_by_id(affiliate_id)
        margin = affiliate.get("margin_percent") if affiliate else None
        if margin is not None:
            affiliate_commission = round(float(amount) * float(margin) / 100, 2)

    charge = await process_card_charge(
        CardChargeRequest(
            user_id=user_id,
            amount=float(amount),
            currency=plan.get("currency", "USD"),
            plan_type=plan_type.value,
            order_id=order_id,
        )
    )
    if not charge.success:
        from services.notification import events as notify_events

        notify_events.payment_failed(
            user=user,
            plan_type=plan_type.value,
            amount=float(amount),
            currency=plan.get("currency", "USD"),
            order_id=order_id,
            card_last4=None,
            failure_reason=charge.message or "Payment failed.",
            previous_plan=previous_plan or None,
        )
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error": charge.message or "Payment failed.",
                "error_code": ErrorCodes.PAYMENT_FAILED,
            },
        )

    processor = "bypass" if charge.bypassed else "gateway"
    commission_value = round(float(affiliate_commission or 0), 2)
    platform_profit = round(float(amount) - commission_value, 2)
    order = Order(
        user_id=user_id,
        order_id=order_id,
        plan_type=plan_type,
        amount=float(amount),
        currency=plan.get("currency", "USD"),
        status=OrderStatus.PAID,
        payment_method_id=None,
        affiliate_id=affiliate_id,
        affiliate_commission=affiliate_commission,
        platform_profit=platform_profit,
        gateway_transaction_id=charge.transaction_id,
        payment_processor=processor,
        created_at=created_at,
    )
    membership = Membership(
        user_id=user_id,
        plan_type=plan_type,
        status=MembershipStatus.ACTIVE,
        start_date=created_at,
        end_date=(_utcnow() + timedelta(days=int(plan.get("duration_days", PLAN_DURATIONS[plan_type.value])))).isoformat(),
        order_id=order_id,
    )
    await run_sync(_table().put_item, Item=order.to_item())
    await run_sync(_table().put_item, Item=membership.to_item())
    try:
        from services.routes.finance.service import adjust_admin_finance, increment_student_commerce

        await increment_student_commerce(
            user_id=user_id,
            amount=float(amount),
            admin_earned=platform_profit,
            currency=plan.get("currency", "USD"),
            plan_type=plan_type.value,
            paid_at=created_at,
            membership_status=MembershipStatus.ACTIVE.value,
            membership_end_date=membership.end_date,
        )
        await adjust_admin_finance(
            revenue=float(amount),
            profit=platform_profit,
            order_count=1,
            currency=plan.get("currency", "USD"),
        )
    except Exception:
        logger.exception(
            "Failed to write stored commerce totals user_id=%s order_id=%s",
            user_id,
            order_id,
        )
    try:
        from services.routes.sales.service import record_paid_sale

        await record_paid_sale(
            order_id=order_id,
            plan_type=plan_type.value,
            amount=float(amount),
            currency=plan.get("currency", "USD"),
            paid_at=created_at,
            affiliate_id=affiliate_id,
            affiliate_commission=affiliate_commission,
        )
    except Exception:
        logger.exception(
            "Failed to record sales snapshot user_id=%s order_id=%s",
            user_id,
            order_id,
        )
    if affiliate_id and affiliate_commission:
        try:
            from services.routes.payout.service import credit_affiliate_commission

            await credit_affiliate_commission(
                affiliate_id=affiliate_id,
                order_id=order_id,
                commission=affiliate_commission,
                order_amount=float(amount),
                currency=plan.get("currency", "USD"),
                plan_type=plan_type.value,
                paid_at=created_at,
                student_user_id=user_id,
            )
        except Exception:
            logger.exception(
                "Failed to credit affiliate wallet affiliate_id=%s order_id=%s",
                affiliate_id,
                order_id,
            )
    logger.info(
        "Plan purchase completed user_id=%s order_id=%s plan=%s amount=%s processor=%s",
        user_id,
        order_id,
        plan_type.value,
        amount,
        processor,
    )
    try:
        from services.notification import events as notify_events

        notify_events.purchase_paid(
            user=user,
            plan_type=plan_type.value,
            previous_plan=previous_plan or None,
            plan_changed=plan_changed,
            amount=float(amount),
            currency=plan.get("currency", "USD"),
            order_id=order_id,
            card_last4=None,
            end_date=membership.end_date,
            affiliate=affiliate,
            affiliate_commission=commission_value,
        )
    except Exception:
        logger.exception("Failed to queue purchase notifications order_id=%s", order_id)

    return {
        "order": {
            "order_id": order_id,
            "plan_type": plan_type.value,
            "amount": amount,
            "currency": plan.get("currency", "USD"),
            "status": OrderStatus.PAID.value,
            "payment_method_id": None,
            "created_at": created_at,
            "gateway_transaction_id": charge.transaction_id,
            "payment_processor": processor,
        },
        "membership": await get_membership(user_id),
    }
