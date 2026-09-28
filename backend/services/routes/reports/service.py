"""Admin order report listing and streamed export."""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, AsyncIterator, Optional

from boto3.dynamodb.conditions import Key
from fastapi import HTTPException, status

from core.async_io import run_sync
from database import get_table
from database_entities import UserRole
from services.common.pagination import build_pagination, normalize_value
from services.routes.auth.service import get_user_by_id
from services.routes.finance.service import get_admin_finance

logger = logging.getLogger(__name__)

LIST_CAP = 5000
EXPORT_CAP = 10000
EXPORT_BATCH_SIZE = 8
LIST_LOOKBACK_YEARS = 3


def _table():
    return get_table()


def _today() -> date:
    return datetime.now(timezone.utc).date()


def resolve_date_range(
    date_from: Optional[str],
    date_to: Optional[str],
) -> tuple[str, str]:
    today = _today()
    end = date.fromisoformat(date_to.strip()[:10]) if date_to and date_to.strip() else today
    start = (
        date.fromisoformat(date_from.strip()[:10])
        if date_from and date_from.strip()
        else end - timedelta(days=29)
    )
    if start > end:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "date_from must be on or before date_to")
    if (end - start).days > 366 * 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Date range cannot exceed 3 years")
    return start.isoformat(), end.isoformat()


def resolve_list_bounds(
    date_from: Optional[str],
    date_to: Optional[str],
) -> tuple[str, str]:
    if date_from or date_to:
        return resolve_date_range(date_from, date_to)
    today = _today()
    start_year = max(2024, today.year - LIST_LOOKBACK_YEARS)
    return date(start_year, 1, 1).isoformat(), today.isoformat()


def _in_date_range(created_at: Any, date_from: str, date_to: str) -> bool:
    stamp = str(created_at or "")[:10]
    if len(stamp) < 10:
        return False
    return date_from <= stamp <= date_to


def _iter_months(date_from: str, date_to: str):
    cursor = date.fromisoformat(date_from[:10]).replace(day=1)
    last = date.fromisoformat(date_to[:10]).replace(day=1)
    while cursor <= last:
        yield f"{cursor.year:04d}-{cursor.month:02d}"
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)


def _student_id_from_item(item: dict[str, Any]) -> Optional[str]:
    pk = str(item.get("PK") or "")
    if pk.startswith("USER#"):
        return pk.removeprefix("USER#") or None
    user_id = item.get("user_id")
    return str(user_id) if user_id else None


def _person_name(first: Any, last: Any, fallback: str) -> str:
    name = " ".join(part for part in (str(first or "").strip(), str(last or "").strip()) if part)
    return name or fallback


async def _query_gsi2(pk: str, sk_prefix: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    kwargs: dict[str, Any] = {
        "IndexName": "GSI2",
        "KeyConditionExpression": Key("GSI2PK").eq(pk) & Key("GSI2SK").begins_with(sk_prefix),
        "ScanIndexForward": False,
    }
    while True:
        def _query(kw=kwargs):
            return _table().query(**kw)

        response = await run_sync(_query)
        items.extend(response.get("Items", []) or [])
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items


async def _list_affiliate_ids() -> list[str]:
    ids: list[str] = []
    kwargs: dict[str, Any] = {
        "KeyConditionExpression": (
            Key("PK").eq(f"ROLE#{UserRole.AFFILIATE.value}") & Key("SK").begins_with("USER#")
        ),
    }
    while True:
        def _query(kw=kwargs):
            return _table().query(**kw)

        response = await run_sync(_query)
        for item in response.get("Items", []) or []:
            user_id = item.get("user_id")
            if user_id:
                ids.append(str(user_id))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return ids


async def collect_raw_orders(
    *,
    date_from: str,
    date_to: str,
    cap: int = LIST_CAP,
) -> list[dict[str, Any]]:
    queries: list[Any] = []
    sem = asyncio.Semaphore(8)

    async def query(pk: str) -> list[dict[str, Any]]:
        async with sem:
            return await _query_gsi2(pk, "ORDER#")

    queries.extend(query(f"ORDERS#{month}") for month in _iter_months(date_from, date_to))
    affiliate_ids = await _list_affiliate_ids()
    queries.extend(query(f"AFFILIATE#{affiliate_id}") for affiliate_id in affiliate_ids)
    batches = await asyncio.gather(*queries) if queries else []

    seen: set[str] = set()
    items: list[dict[str, Any]] = []
    for batch in batches:
        for item in batch:
            if len(items) >= cap:
                break
            if item.get("entity") not in (None, "ORDER"):
                continue
            order_id = str(item.get("order_id") or "")
            if not order_id or order_id in seen:
                continue
            if not _in_date_range(item.get("created_at"), date_from, date_to):
                continue
            seen.add(order_id)
            items.append(item)
        if len(items) >= cap:
            break

    items.sort(key=lambda row: str(row.get("created_at") or ""), reverse=True)
    return items


async def _person(user_id: Optional[str], cache: dict[str, Optional[dict[str, Any]]]) -> Optional[dict[str, Any]]:
    if not user_id:
        return None
    if user_id in cache:
        return cache[user_id]
    user = await get_user_by_id(user_id)
    if not user:
        cache[user_id] = None
        return None
    brief = {
        "user_id": user_id,
        "first_name": user.get("first_name") or "",
        "last_name": user.get("last_name") or "",
        "email": user.get("email") or "",
        "name": _person_name(user.get("first_name"), user.get("last_name"), "User"),
    }
    cache[user_id] = brief
    return brief


async def enrich_order(
    item: dict[str, Any],
    cache: Optional[dict[str, Optional[dict[str, Any]]]] = None,
) -> dict[str, Any]:
    people = cache if cache is not None else {}
    amount = float(normalize_value(item.get("amount")) or 0)
    commission = float(normalize_value(item.get("affiliate_commission")) or 0)
    profit = normalize_value(item.get("platform_profit"))
    if profit is None:
        profit = round(amount - commission, 2)
    else:
        profit = float(profit)

    student_id = _student_id_from_item(item)
    affiliate_id = str(item.get("affiliate_id") or "") or None
    student = await _person(student_id, people)
    affiliate = await _person(affiliate_id, people)

    return {
        "order_id": str(item.get("order_id") or ""),
        "created_at": item.get("created_at"),
        "status": item.get("status"),
        "plan_type": item.get("plan_type"),
        "item_kind": item.get("item_kind") or ("webinar" if item.get("webinar_id") else "plan"),
        "webinar_id": item.get("webinar_id"),
        "webinar_title": item.get("webinar_title"),
        "amount": round(amount, 2),
        "currency": str(item.get("currency") or "USD"),
        "student_user_id": student_id,
        "student_name": student.get("name") if student else None,
        "student_email": student.get("email") if student else None,
        "affiliate_id": affiliate_id,
        "affiliate_name": affiliate.get("name") if affiliate else None,
        "affiliate_email": affiliate.get("email") if affiliate else None,
        "affiliate_commission": round(commission, 2) if affiliate_id or commission else None,
        "platform_profit": round(float(profit), 2),
        "gateway_transaction_id": item.get("gateway_transaction_id"),
        "payment_processor": item.get("payment_processor"),
        "payment_method_id": item.get("payment_method_id"),
    }


def totals_from_finance(finance: dict[str, Any]) -> dict[str, Any]:
    return {
        "order_count": int(finance.get("order_count") or 0),
        "revenue": round(float(finance.get("revenue") or 0), 2),
        "commission": round(float(finance.get("affiliate_earned") or 0), 2),
        "profit": round(float(finance.get("profit") or 0), 2),
        "currency": str(finance.get("currency") or "USD"),
    }


async def list_report_orders(
    *,
    scope: str,
    date_from: Optional[str],
    date_to: Optional[str],
    page: int = 1,
    limit: int = 20,
) -> dict[str, Any]:
    if page < 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "page must be >= 1")
    if limit < 1 or limit > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "limit must be between 1 and 100")

    _ = scope
    start, end = resolve_list_bounds(date_from, date_to)
    raw_items = await collect_raw_orders(date_from=start, date_to=end)
    start_index = (page - 1) * limit
    page_raw = raw_items[start_index : start_index + limit]
    cache: dict[str, Optional[dict[str, Any]]] = {}
    enriched = (
        await asyncio.gather(*[enrich_order(item, cache) for item in page_raw]) if page_raw else []
    )
    finance = await get_admin_finance()
    has_next = start_index + limit < len(raw_items)
    return {
        "items": list(enriched),
        "pagination": build_pagination(
            page=page,
            limit=limit,
            total=len(raw_items),
            has_next=has_next,
        ),
        "totals": totals_from_finance(finance),
        "date_from": start,
        "date_to": end,
    }


async def iter_export_batches(
    *,
    scope: str,
    date_from: Optional[str],
    date_to: Optional[str],
    batch_size: int = EXPORT_BATCH_SIZE,
) -> AsyncIterator[dict[str, Any]]:
    _ = scope
    start, end = resolve_date_range(date_from, date_to)
    raw_items = await collect_raw_orders(
        date_from=start,
        date_to=end,
        cap=EXPORT_CAP,
    )
    total = len(raw_items)
    yield {
        "type": "start",
        "date_from": start,
        "date_to": end,
        "current": 0,
        "total": total,
        "percent": 0 if total else 100,
    }

    cache: dict[str, Optional[dict[str, Any]]] = {}
    current = 0
    batch: list[dict[str, Any]] = []
    for item in raw_items:
        batch.append(await enrich_order(item, cache))
        current += 1
        if len(batch) >= batch_size:
            percent = 100 if total == 0 else int(round((current / total) * 100))
            yield {
                "type": "batch",
                "current": current,
                "total": total,
                "percent": percent,
                "items": batch,
            }
            batch = []

    if batch:
        percent = 100 if total == 0 else int(round((current / total) * 100))
        yield {
            "type": "batch",
            "current": current,
            "total": total,
            "percent": percent,
            "items": batch,
        }

    yield {
        "type": "complete",
        "date_from": start,
        "date_to": end,
        "current": total,
        "total": total,
        "percent": 100,
    }
