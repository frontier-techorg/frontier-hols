"""Webinar catalog, admin management, and student booking."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from boto3.dynamodb.conditions import Attr, Key
from fastapi import HTTPException, status

from core.async_io import run_sync
from database import get_table
from database_entities import (
    Order,
    OrderStatus,
    UserRole,
    Webinar,
    WebinarRegistration,
    WebinarRegistrationStatus,
    WebinarStatus,
    now_iso,
)
from services.common.pagination import build_pagination, normalize_value
from services.routes.auth.service import get_user_by_id

logger = logging.getLogger(__name__)

VALID_STATUSES = {item.value for item in WebinarStatus}


def _table():
    return get_table()


def _parse_iso(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid datetime format") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _public_webinar(
    item: dict[str, Any],
    *,
    is_booked: bool = False,
    reveal_join_url: bool = False,
) -> dict[str, Any]:
    capacity = int(item.get("capacity") or 0)
    seats_taken = int(item.get("seats_taken") or 0)
    join_url = item.get("join_url") if reveal_join_url else None
    return {
        "webinar_id": item.get("webinar_id"),
        "title": item.get("title"),
        "description": item.get("description"),
        "starts_at": item.get("starts_at"),
        "ends_at": item.get("ends_at"),
        "price": float(normalize_value(item.get("price")) or 0),
        "currency": item.get("currency") or "USD",
        "capacity": capacity,
        "seats_taken": seats_taken,
        "seats_remaining": max(capacity - seats_taken, 0),
        "status": item.get("status"),
        "join_url": join_url,
        "thumbnail_url": item.get("thumbnail_url"),
        "is_booked": is_booked,
        "created_at": item.get("created_at"),
    }


def _public_registration(
    item: dict[str, Any],
    *,
    webinar: Optional[dict[str, Any]] = None,
    user: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    return {
        "webinar_id": item.get("webinar_id"),
        "user_id": item.get("user_id"),
        "order_id": item.get("order_id"),
        "amount": float(normalize_value(item.get("amount")) or 0),
        "currency": item.get("currency") or "USD",
        "status": item.get("status"),
        "created_at": item.get("created_at"),
        "webinar_title": webinar.get("title") if webinar else None,
        "starts_at": webinar.get("starts_at") if webinar else None,
        "join_url": webinar.get("join_url") if webinar else None,
        "first_name": user.get("first_name") if user else None,
        "last_name": user.get("last_name") if user else None,
        "email": user.get("email") if user else None,
    }


def _normalize_sort(sort: Optional[str]) -> str:
    return "oldest" if str(sort or "").strip().lower() == "oldest" else "newest"


def _starts_at_sort_key(item: dict[str, Any]) -> float:
    raw = str(item.get("starts_at") or "")
    try:
        return _parse_iso(raw).timestamp()
    except HTTPException:
        return 0.0


def _filter_webinars(
    items: list[dict[str, Any]],
    *,
    q: Optional[str] = None,
    status_value: Optional[str] = None,
) -> list[dict[str, Any]]:
    needle = (q or "").strip().lower()
    status = (status_value or "").strip().lower()
    filtered = items
    if status and status not in {"", "all"} and status in VALID_STATUSES:
        filtered = [item for item in filtered if str(item.get("status") or "") == status]
    if needle:
        filtered = [
            item
            for item in filtered
            if needle in str(item.get("title") or "").lower()
            or needle in str(item.get("join_url") or "").lower()
        ]
    return filtered


def _sort_webinars(items: list[dict[str, Any]], *, sort: Optional[str] = None) -> list[dict[str, Any]]:
    reverse = _normalize_sort(sort) == "newest"
    return sorted(items, key=_starts_at_sort_key, reverse=reverse)


async def _get_webinar_item(webinar_id: str) -> dict[str, Any]:
    def _fetch():
        return _table().get_item(Key={"PK": Webinar.pk(webinar_id), "SK": Webinar.sk()})

    response = await run_sync(_fetch)
    item = response.get("Item")
    if not item or item.get("entity") != Webinar.ENTITY:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Webinar not found")
    return item


async def _get_registration(user_id: str, webinar_id: str) -> Optional[dict[str, Any]]:
    def _fetch():
        return _table().get_item(
            Key={"PK": WebinarRegistration.pk(user_id), "SK": WebinarRegistration.sk(webinar_id)}
        )

    response = await run_sync(_fetch)
    item = response.get("Item")
    if not item or item.get("entity") != WebinarRegistration.ENTITY:
        return None
    return item


async def _list_booked_webinar_ids(user_id: str) -> set[str]:
    kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(WebinarRegistration.pk(user_id))
        & Key("SK").begins_with("WEBINAR_REG#"),
    }
    ids: set[str] = set()
    while True:
        def _query(kw=dict(kwargs)):
            return _table().query(**kw)

        response = await run_sync(_query)
        for item in response.get("Items") or []:
            if item.get("entity") != WebinarRegistration.ENTITY:
                continue
            if item.get("status") != WebinarRegistrationStatus.BOOKED.value:
                continue
            webinar_id = item.get("webinar_id")
            if webinar_id:
                ids.add(str(webinar_id))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return ids


async def _list_webinar_items(*, published_only: bool = False) -> list[dict[str, Any]]:
    kwargs: dict[str, Any] = {
        "IndexName": "GSI1",
        "KeyConditionExpression": Key("GSI1PK").eq("SECTION#webinars"),
        "ScanIndexForward": True,
    }
    if published_only:
        kwargs["FilterExpression"] = Attr("status").eq(WebinarStatus.PUBLISHED.value)

    items: list[dict[str, Any]] = []
    while True:
        def _query(kw=dict(kwargs)):
            return _table().query(**kw)

        response = await run_sync(_query)
        for item in response.get("Items") or []:
            if item.get("entity") != Webinar.ENTITY:
                continue
            items.append(item)
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items


def _webinar_notify_snapshot(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": str(item.get("title") or "").strip(),
        "description": str(item.get("description") or "").strip(),
        "starts_at": str(item.get("starts_at") or ""),
        "ends_at": str(item.get("ends_at") or ""),
        "price": float(normalize_value(item.get("price")) or 0),
        "currency": str(item.get("currency") or "USD").upper(),
        "capacity": int(item.get("capacity") or 0),
        "join_url": str(item.get("join_url") or "").strip(),
        "status": str(item.get("status") or ""),
    }


def _paginate(items: list[dict[str, Any]], *, page: int, limit: int) -> dict[str, Any]:
    if page < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "page must be >= 1")
    if limit < 1 or limit > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "limit must be between 1 and 100")
    total = len(items)
    start = (page - 1) * limit
    end = start + limit
    page_items = items[start:end]
    return {
        "items": page_items,
        "pagination": build_pagination(
            page=page,
            limit=limit,
            total=total,
            has_next=end < total,
            next_cursor=None,
        ),
    }


async def create_webinar(
    *,
    admin_user_id: str,
    title: str,
    description: Optional[str],
    starts_at: str,
    ends_at: Optional[str],
    price: float,
    currency: str,
    capacity: int,
    join_url: Optional[str],
    status_value: str,
) -> dict[str, Any]:
    if status_value not in VALID_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid webinar status")
    if capacity < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Capacity must be at least 1")
    cleaned_join_url = (join_url or "").strip()
    if not cleaned_join_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Join URL is required")
    starts = _parse_iso(starts_at)
    if starts < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Start time must be in the future")
    if ends_at:
        ends = _parse_iso(ends_at)
        if ends <= starts:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "End time must be after start time")

    webinar_id = uuid.uuid4().hex
    created_at = now_iso()
    webinar = Webinar(
        webinar_id=webinar_id,
        title=title.strip(),
        description=(description or "").strip() or None,
        starts_at=starts_at,
        ends_at=ends_at,
        price=price,
        currency=currency.upper(),
        capacity=capacity,
        seats_taken=0,
        join_url=cleaned_join_url,
        thumbnail_url=None,
        status=WebinarStatus(status_value),
        created_by=admin_user_id,
        created_at=created_at,
        updated_at=created_at,
    )
    item = webinar.to_item()
    await run_sync(_table().put_item, Item=item)
    logger.info("Webinar created webinar_id=%s by=%s", webinar_id, admin_user_id)
    try:
        from services.notification import events as notify_events

        notify_events.webinar_created(webinar=item)
    except Exception:
        logger.exception("Failed to queue webinar created notification webinar_id=%s", webinar_id)
    return _public_webinar(item, reveal_join_url=True)


async def update_webinar(webinar_id: str, **fields: Any) -> dict[str, Any]:
    item = await _get_webinar_item(webinar_id)
    previous_status = str(item.get("status") or "")
    previous_snapshot = _webinar_notify_snapshot(item)
    updates = {key: value for key, value in fields.items() if value is not None}
    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid webinar status")
    if "starts_at" in updates:
        starts = _parse_iso(str(updates["starts_at"]))
        if starts < datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Start time must be in the future")
    if "ends_at" in updates and updates["ends_at"]:
        _parse_iso(str(updates["ends_at"]))
    if "title" in updates:
        updates["title"] = str(updates["title"]).strip()
    if "description" in updates:
        text = str(updates["description"]).strip()
        updates["description"] = text or None
    if "join_url" in updates:
        url = str(updates["join_url"]).strip()
        if not url:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Join URL is required")
        updates["join_url"] = url
    if "currency" in updates:
        updates["currency"] = str(updates["currency"]).upper()
    if "capacity" in updates:
        capacity = int(updates["capacity"])
        if capacity < 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Capacity must be at least 1")
        if capacity < int(item.get("seats_taken") or 0):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Capacity cannot be below seats already taken",
            )
        updates["capacity"] = capacity

    item.update(updates)
    item["updated_at"] = now_iso()
    webinar = Webinar(
        webinar_id=item["webinar_id"],
        title=item["title"],
        description=item.get("description"),
        starts_at=item["starts_at"],
        ends_at=item.get("ends_at"),
        price=float(normalize_value(item.get("price")) or 0),
        currency=item.get("currency") or "USD",
        capacity=int(item.get("capacity") or 100),
        seats_taken=int(item.get("seats_taken") or 0),
        join_url=item.get("join_url"),
        thumbnail_url=item.get("thumbnail_url"),
        status=WebinarStatus(item.get("status") or WebinarStatus.DRAFT.value),
        created_by=item.get("created_by"),
        created_at=item.get("created_at") or now_iso(),
        updated_at=item["updated_at"],
    )
    saved = webinar.to_item()
    await run_sync(_table().put_item, Item=saved)
    try:
        from services.notification import events as notify_events

        notify_events.webinar_updated(
            webinar=saved,
            previous_status=previous_status,
            changed=_webinar_notify_snapshot(saved) != previous_snapshot,
        )
    except Exception:
        logger.exception("Failed to queue webinar updated notification webinar_id=%s", webinar_id)
    return _public_webinar(saved, reveal_join_url=True)


MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024
ALLOWED_THUMBNAIL_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif"}
)


async def upload_webinar_thumbnail(
    webinar_id: str,
    *,
    filename: str,
    content_type: str,
    data: bytes,
) -> dict[str, Any]:
    """Upload a webinar thumbnail to S3 and persist its public URL."""
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Thumbnail file is empty")
    if len(data) > MAX_THUMBNAIL_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Thumbnail must be 5 MB or smaller",
        )
    if content_type not in ALLOWED_THUMBNAIL_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Thumbnail must be JPEG, PNG, WebP, or GIF",
        )

    item = await _get_webinar_item(webinar_id)
    from services.common import s3bucket

    key = s3bucket.build_key(f"webinars/{webinar_id}/thumb", filename or "thumb.jpg")
    public_url = s3bucket.public_url(key)
    await s3bucket.upload_image_async(key=key, data=data, content_type=content_type)
    item["thumbnail_url"] = public_url
    item["updated_at"] = now_iso()
    webinar = Webinar(
        webinar_id=item["webinar_id"],
        title=item["title"],
        description=item.get("description"),
        starts_at=item["starts_at"],
        ends_at=item.get("ends_at"),
        price=float(normalize_value(item.get("price")) or 0),
        currency=item.get("currency") or "USD",
        capacity=int(item.get("capacity") or 100),
        seats_taken=int(item.get("seats_taken") or 0),
        join_url=item.get("join_url"),
        thumbnail_url=item.get("thumbnail_url"),
        status=WebinarStatus(item.get("status") or WebinarStatus.DRAFT.value),
        created_by=item.get("created_by"),
        created_at=item.get("created_at") or now_iso(),
        updated_at=item["updated_at"],
    )
    saved = webinar.to_item()
    await run_sync(_table().put_item, Item=saved)
    logger.info("Webinar thumbnail updated webinar_id=%s", webinar_id)
    return _public_webinar(saved, reveal_join_url=True)


async def list_webinars_admin(
    *,
    page: int = 1,
    limit: int = 12,
    q: Optional[str] = None,
    status_value: Optional[str] = None,
    sort: Optional[str] = None,
) -> dict[str, Any]:
    items = await _list_webinar_items(published_only=False)
    items = _sort_webinars(_filter_webinars(items, q=q, status_value=status_value), sort=sort)
    page_data = _paginate(items, page=page, limit=limit)
    return {
        "items": [_public_webinar(item, reveal_join_url=True) for item in page_data["items"]],
        "pagination": page_data["pagination"],
    }


async def list_webinars_student(
    *,
    user_id: str,
    page: int = 1,
    limit: int = 12,
    q: Optional[str] = None,
    status_value: Optional[str] = None,
    sort: Optional[str] = None,
) -> dict[str, Any]:
    items = await _list_webinar_items(published_only=True)
    booked_ids = await _list_booked_webinar_ids(user_id)
    audience = (status_value or "all").strip().lower()
    if audience == "booked":
        items = [item for item in items if str(item.get("webinar_id")) in booked_ids]
    elif audience == "open":
        items = [
            item
            for item in items
            if str(item.get("webinar_id")) not in booked_ids
            and max(int(item.get("capacity") or 0) - int(item.get("seats_taken") or 0), 0) > 0
        ]
    items = _sort_webinars(_filter_webinars(items, q=q, status_value=None), sort=sort)
    page_data = _paginate(items, page=page, limit=limit)
    public_items = []
    for item in page_data["items"]:
        booked = str(item["webinar_id"]) in booked_ids
        public_items.append(
            _public_webinar(item, is_booked=booked, reveal_join_url=booked),
        )
    return {"items": public_items, "pagination": page_data["pagination"]}


async def get_webinar_for_student(user_id: str, webinar_id: str) -> dict[str, Any]:
    item = await _get_webinar_item(webinar_id)
    if item.get("status") != WebinarStatus.PUBLISHED.value:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Webinar not found")
    registration = await _get_registration(user_id, webinar_id)
    booked = bool(
        registration and registration.get("status") == WebinarRegistrationStatus.BOOKED.value
    )
    return _public_webinar(item, is_booked=booked, reveal_join_url=booked)


async def get_webinar_for_admin(webinar_id: str) -> dict[str, Any]:
    item = await _get_webinar_item(webinar_id)
    return _public_webinar(item, reveal_join_url=True)


async def list_registrants(
    webinar_id: str,
    *,
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    await _get_webinar_item(webinar_id)
    kwargs: dict[str, Any] = {
        "IndexName": "GSI1",
        "KeyConditionExpression": Key("GSI1PK").eq(f"WEBINAR#{webinar_id}")
        & Key("GSI1SK").begins_with("REG#"),
        "ScanIndexForward": False,
    }
    items: list[dict[str, Any]] = []
    while True:
        def _query(kw=dict(kwargs)):
            return _table().query(**kw)

        response = await run_sync(_query)
        for item in response.get("Items") or []:
            if item.get("entity") != WebinarRegistration.ENTITY:
                continue
            if item.get("status") != WebinarRegistrationStatus.BOOKED.value:
                continue
            items.append(item)
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key

    page_data = _paginate(items, page=page, limit=limit)
    public_items = []
    for item in page_data["items"]:
        user_id = str(item.get("user_id") or "")
        user = await get_user_by_id(user_id) if user_id else None
        public_items.append(_public_registration(item, user=user))
    return {
        "items": public_items,
        "pagination": page_data["pagination"],
    }


async def book_webinar(
    *,
    user_id: str,
    webinar_id: str,
    payment_method_id: Optional[str] = None,
) -> dict[str, Any]:
    _ = payment_method_id
    user = await get_user_by_id(user_id)
    if not user or user.get("role") != UserRole.STUDENT.value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only students can book webinars")

    webinar = await _get_webinar_item(webinar_id)
    if webinar.get("status") != WebinarStatus.PUBLISHED.value:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Webinar is not open for booking")

    starts_at = _parse_iso(str(webinar.get("starts_at")))
    if starts_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This webinar has already started")

    existing = await _get_registration(user_id, webinar_id)
    if existing and existing.get("status") == WebinarRegistrationStatus.BOOKED.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "You are already booked for this webinar")

    capacity = int(webinar.get("capacity") or 0)
    seats_taken = int(webinar.get("seats_taken") or 0)
    if seats_taken >= capacity:
        raise HTTPException(status.HTTP_409_CONFLICT, "This webinar is full")

    price = float(normalize_value(webinar.get("price")) or 0)
    currency = str(webinar.get("currency") or "USD")
    order_id: Optional[str] = None
    created_at = now_iso()

    if price > 0:
        from models.common import ErrorCodes
        from services.common.payment_gateway import CardChargeRequest, process_card_charge

        order_id = uuid.uuid4().hex
        affiliate_id = user.get("referred_by_affiliate_id")
        affiliate_commission = None
        if affiliate_id:
            affiliate = await get_user_by_id(str(affiliate_id))
            margin = affiliate.get("margin_percent") if affiliate else None
            if margin is not None:
                affiliate_commission = round(price * float(margin) / 100, 2)

        charge = await process_card_charge(
            CardChargeRequest(
                user_id=user_id,
                amount=price,
                currency=currency,
                plan_type="webinar",
                order_id=order_id,
            )
        )
        if not charge.success:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "error": charge.message or "Payment failed.",
                    "error_code": ErrorCodes.PAYMENT_FAILED,
                },
            )

        processor = "bypass" if charge.bypassed else "gateway"
        commission_value = round(float(affiliate_commission or 0), 2)
        platform_profit = round(price - commission_value, 2)
        paid_order = Order(
            user_id=user_id,
            order_id=order_id,
            item_kind="webinar",
            webinar_id=webinar_id,
            webinar_title=str(webinar.get("title") or "Webinar"),
            amount=price,
            currency=currency,
            status=OrderStatus.PAID,
            affiliate_id=str(affiliate_id) if affiliate_id else None,
            affiliate_commission=affiliate_commission,
            platform_profit=platform_profit,
            gateway_transaction_id=charge.transaction_id,
            payment_processor=processor,
            created_at=created_at,
        )
        await run_sync(_table().put_item, Item=paid_order.to_item())
        try:
            from services.routes.finance.service import adjust_admin_finance, increment_student_commerce
            from services.routes.sales.service import record_paid_sale

            await increment_student_commerce(
                user_id=user_id,
                amount=price,
                admin_earned=platform_profit,
                currency=currency,
                plan_type="webinar",
                paid_at=created_at,
                update_membership=False,
            )
            await adjust_admin_finance(
                revenue=price,
                profit=platform_profit,
                order_count=1,
                currency=currency,
            )
            await record_paid_sale(
                order_id=order_id,
                plan_type="webinar",
                amount=price,
                currency=currency,
                paid_at=created_at,
                affiliate_id=str(affiliate_id) if affiliate_id else None,
                affiliate_commission=affiliate_commission,
                include_plan_bucket=False,
            )
        except Exception:
            logger.exception(
                "Failed to write webinar commerce totals user_id=%s order_id=%s",
                user_id,
                order_id,
            )

    registration = WebinarRegistration(
        user_id=user_id,
        webinar_id=webinar_id,
        order_id=order_id,
        amount=price,
        currency=currency,
        status=WebinarRegistrationStatus.BOOKED,
        payment_method_id=None,
        created_at=created_at,
    )
    webinar["seats_taken"] = seats_taken + 1
    webinar["updated_at"] = created_at
    saved_webinar = Webinar(
        webinar_id=webinar["webinar_id"],
        title=webinar["title"],
        description=webinar.get("description"),
        starts_at=webinar["starts_at"],
        ends_at=webinar.get("ends_at"),
        price=price,
        currency=currency,
        capacity=capacity,
        seats_taken=seats_taken + 1,
        join_url=webinar.get("join_url"),
        thumbnail_url=webinar.get("thumbnail_url"),
        status=WebinarStatus(webinar.get("status")),
        created_by=webinar.get("created_by"),
        created_at=webinar.get("created_at") or created_at,
        updated_at=created_at,
    ).to_item()

    await run_sync(_table().put_item, Item=registration.to_item())
    await run_sync(_table().put_item, Item=saved_webinar)
    logger.info(
        "Webinar booked user_id=%s webinar_id=%s amount=%s",
        user_id,
        webinar_id,
        price,
    )

    public_webinar = _public_webinar(saved_webinar, is_booked=True, reveal_join_url=True)
    try:
        from services.notification import events as notify_events

        notify_events.student_joined_webinar(student=user, webinar=public_webinar)
    except Exception:
        logger.exception(
            "Failed to queue webinar booking notification user_id=%s webinar_id=%s",
            user_id,
            webinar_id,
        )
    return {
        "registration": _public_registration(registration.to_item(), webinar=public_webinar),
        "webinar": public_webinar,
    }


async def list_my_registrations(user_id: str) -> list[dict[str, Any]]:
    kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(WebinarRegistration.pk(user_id))
        & Key("SK").begins_with("WEBINAR_REG#"),
        "ScanIndexForward": False,
    }
    items: list[dict[str, Any]] = []
    while True:
        def _query(kw=dict(kwargs)):
            return _table().query(**kw)

        response = await run_sync(_query)
        for item in response.get("Items") or []:
            if item.get("entity") != WebinarRegistration.ENTITY:
                continue
            if item.get("status") != WebinarRegistrationStatus.BOOKED.value:
                continue
            items.append(item)
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key

    results: list[dict[str, Any]] = []
    for item in items:
        try:
            webinar = await _get_webinar_item(str(item["webinar_id"]))
        except HTTPException:
            webinar = None
        public = _public_webinar(webinar, is_booked=True, reveal_join_url=True) if webinar else None
        results.append(_public_registration(item, webinar=public))
    return results
