"""Sales, revenue, and profit snapshots written on each paid purchase."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from boto3.dynamodb.conditions import Key

from core.async_io import run_sync
from database import get_table
from database_entities import SalesSnapshot, now_iso
from services.common.pagination import normalize_value

logger = logging.getLogger(__name__)

PLAN_TYPES = ("monthly", "biannual", "annual")


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


def _format_day(value: datetime, *, with_year: bool = False) -> str:
    label = f"{value.strftime('%b')} {value.day}"
    if with_year:
        return f"{label}, {value.year}"
    return label


def period_buckets(paid_at: datetime) -> list[dict[str, Optional[str]]]:
    """Week, month, year, and all-time keys for a payment timestamp."""
    paid_at = paid_at.astimezone(timezone.utc)
    iso = paid_at.isocalendar()
    week_monday = paid_at - timedelta(days=paid_at.weekday())
    week_sunday = week_monday + timedelta(days=6)
    week_id = f"{iso.year}-W{iso.week:02d}"
    month_id = paid_at.strftime("%Y-%m")
    year_id = paid_at.strftime("%Y")
    return [
        {
            "sk": "TOTAL",
            "period": "total",
            "period_key": "all",
            "label": "All time",
            "starts_at": None,
        },
        {
            "sk": f"WEEK#{week_id}",
            "period": "week",
            "period_key": week_id,
            "label": f"{_format_day(week_monday)} – {_format_day(week_sunday, with_year=True)}",
            "starts_at": week_monday.date().isoformat(),
        },
        {
            "sk": f"MONTH#{month_id}",
            "period": "month",
            "period_key": month_id,
            "label": paid_at.strftime("%b %Y"),
            "starts_at": paid_at.replace(day=1).date().isoformat(),
        },
        {
            "sk": f"YEAR#{year_id}",
            "period": "year",
            "period_key": year_id,
            "label": year_id,
            "starts_at": f"{year_id}-01-01",
        },
    ]


def empty_snapshot(
    *,
    period: str = "total",
    period_key: str = "all",
    label: str = "All time",
    currency: str = "USD",
) -> dict[str, Any]:
    return {
        "period": period,
        "period_key": period_key,
        "label": label,
        "starts_at": None,
        "sales_count": 0,
        "revenue": 0.0,
        "profit": 0.0,
        "affiliate_earnings": 0.0,
        "earnings": 0.0,
        "referred_count": 0,
        "referred_revenue": 0.0,
        "direct_count": 0,
        "direct_revenue": 0.0,
        "plan_monthly_count": 0,
        "plan_monthly_revenue": 0.0,
        "plan_biannual_count": 0,
        "plan_biannual_revenue": 0.0,
        "plan_annual_count": 0,
        "plan_annual_revenue": 0.0,
        "currency": currency,
        "updated_at": None,
        "last_order_id": None,
    }


def public_snapshot(item: Optional[dict[str, Any]], *, currency: str = "USD") -> dict[str, Any]:
    if not item:
        return empty_snapshot(currency=currency)
    return {
        "period": item.get("period") or "total",
        "period_key": item.get("period_key") or "all",
        "label": item.get("label") or "All time",
        "starts_at": item.get("starts_at"),
        "sales_count": _as_int(item.get("sales_count")),
        "revenue": _as_float(item.get("revenue")),
        "profit": _as_float(item.get("profit")),
        "affiliate_earnings": _as_float(item.get("affiliate_earnings")),
        "earnings": _as_float(item.get("earnings")),
        "referred_count": _as_int(item.get("referred_count")),
        "referred_revenue": _as_float(item.get("referred_revenue")),
        "direct_count": _as_int(item.get("direct_count")),
        "direct_revenue": _as_float(item.get("direct_revenue")),
        "plan_monthly_count": _as_int(item.get("plan_monthly_count")),
        "plan_monthly_revenue": _as_float(item.get("plan_monthly_revenue")),
        "plan_biannual_count": _as_int(item.get("plan_biannual_count")),
        "plan_biannual_revenue": _as_float(item.get("plan_biannual_revenue")),
        "plan_annual_count": _as_int(item.get("plan_annual_count")),
        "plan_annual_revenue": _as_float(item.get("plan_annual_revenue")),
        "currency": item.get("currency") or currency,
        "updated_at": item.get("updated_at"),
        "last_order_id": item.get("last_order_id"),
    }


async def _increment_snapshot(
    *,
    pk: str,
    bucket: dict[str, Optional[str]],
    plan_type: str,
    revenue: Decimal,
    profit: Decimal,
    affiliate_earnings: Decimal,
    earnings: Decimal,
    referred: bool,
    currency: str,
    order_id: str,
    include_plan_bucket: bool = True,
) -> None:
    plan_key = plan_type if plan_type in PLAN_TYPES else "monthly"
    values: dict[str, Any] = {
        ":one": Decimal("1"),
        ":revenue": revenue,
        ":profit": profit,
        ":affiliate_earnings": affiliate_earnings,
        ":earnings": earnings,
        ":zero": Decimal("0"),
        ":currency": currency,
        ":now": now_iso(),
        ":order_id": order_id,
        ":entity": SalesSnapshot.ENTITY,
        ":period": bucket["period"],
        ":period_key": bucket["period_key"],
        ":label": bucket["label"],
    }
    add_parts = [
        "sales_count :one",
        "revenue :revenue",
        "profit :profit",
        "affiliate_earnings :affiliate_earnings",
        "earnings :earnings",
    ]
    if include_plan_bucket:
        add_parts.extend(
            [
                f"plan_{plan_key}_count :one",
                f"plan_{plan_key}_revenue :revenue",
            ]
        )
    if referred:
        add_parts.extend(["referred_count :one", "referred_revenue :revenue"])
        add_parts.extend(["direct_count :zero", "direct_revenue :zero"])
    else:
        add_parts.extend(["direct_count :one", "direct_revenue :revenue"])
        add_parts.extend(["referred_count :zero", "referred_revenue :zero"])

    set_parts = [
        "currency = :currency",
        "updated_at = :now",
        "last_order_id = :order_id",
        "entity = if_not_exists(entity, :entity)",
        "#period = if_not_exists(#period, :period)",
        "period_key = if_not_exists(period_key, :period_key)",
        "#label = if_not_exists(#label, :label)",
    ]
    names = {"#period": "period", "#label": "label"}
    if bucket.get("starts_at"):
        values[":starts_at"] = bucket["starts_at"]
        set_parts.append("starts_at = if_not_exists(starts_at, :starts_at)")

    def _update():
        return _table().update_item(
            Key={"PK": pk, "SK": bucket["sk"]},
            UpdateExpression="ADD " + ", ".join(add_parts) + " SET " + ", ".join(set_parts),
            ExpressionAttributeValues=values,
            ExpressionAttributeNames=names,
        )

    await run_sync(_update)


async def record_paid_sale(
    *,
    order_id: str,
    plan_type: str,
    amount: float | Decimal,
    currency: str,
    paid_at: datetime | str,
    affiliate_id: Optional[str],
    affiliate_commission: Optional[float | Decimal],
    include_plan_bucket: bool = True,
) -> dict[str, float]:
    """Increment stored week/month/year/all-time sales on a successful payment."""
    if isinstance(paid_at, str):
        paid_at = datetime.fromisoformat(paid_at.replace("Z", "+00:00"))
    if paid_at.tzinfo is None:
        paid_at = paid_at.replace(tzinfo=timezone.utc)

    revenue = _as_decimal(round(float(amount), 2))
    commission = _as_decimal(round(float(affiliate_commission or 0), 2))
    profit = revenue - commission
    referred = bool(affiliate_id)
    buckets = period_buckets(paid_at)

    for bucket in buckets:
        await _increment_snapshot(
            pk=SalesSnapshot.admin_pk(),
            bucket=bucket,
            plan_type=plan_type,
            revenue=revenue,
            profit=profit,
            affiliate_earnings=commission,
            earnings=_as_decimal(0),
            referred=referred,
            currency=currency,
            order_id=order_id,
            include_plan_bucket=include_plan_bucket,
        )

    if affiliate_id:
        for bucket in buckets:
            await _increment_snapshot(
                pk=SalesSnapshot.affiliate_pk(affiliate_id),
                bucket=bucket,
                plan_type=plan_type,
                revenue=revenue,
                profit=_as_decimal(0),
                affiliate_earnings=_as_decimal(0),
                earnings=commission,
                referred=True,
                currency=currency,
                order_id=order_id,
                include_plan_bucket=include_plan_bucket,
            )

    logger.info(
        "Recorded sale order_id=%s plan=%s revenue=%s profit=%s affiliate_earnings=%s affiliate_id=%s",
        order_id,
        plan_type,
        revenue,
        profit,
        commission,
        affiliate_id or "none",
    )
    return {
        "revenue": float(revenue),
        "profit": float(profit),
        "affiliate_earnings": float(commission),
    }


async def _query_snapshots(pk: str, prefix: str) -> list[dict[str, Any]]:
    query_kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(pk) & Key("SK").begins_with(prefix),
        "ScanIndexForward": True,
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


async def _get_snapshot(pk: str, sk: str) -> Optional[dict[str, Any]]:
    def _fetch():
        return _table().get_item(Key={"PK": pk, "SK": sk}).get("Item")

    return await run_sync(_fetch)


async def get_sales_overview(*, owner_pk: str) -> dict[str, Any]:
    totals_item = await _get_snapshot(owner_pk, "TOTAL")
    currency = (totals_item or {}).get("currency") or "USD"
    weeks = await _query_snapshots(owner_pk, "WEEK#")
    months = await _query_snapshots(owner_pk, "MONTH#")
    years = await _query_snapshots(owner_pk, "YEAR#")
    return {
        "currency": currency,
        "totals": public_snapshot(totals_item, currency=currency),
        "weeks": [public_snapshot(item, currency=currency) for item in weeks],
        "months": [public_snapshot(item, currency=currency) for item in months],
        "years": [public_snapshot(item, currency=currency) for item in years],
    }


async def get_admin_sales_overview() -> dict[str, Any]:
    from services.routes.finance.service import get_admin_finance

    overview = await get_sales_overview(owner_pk=SalesSnapshot.admin_pk())
    overview["finance"] = await get_admin_finance()
    return overview


async def get_affiliate_sales_overview(affiliate_id: str) -> dict[str, Any]:
    return await get_sales_overview(owner_pk=SalesSnapshot.affiliate_pk(affiliate_id))


def _week_anchor(value: datetime) -> datetime:
    value = value.astimezone(timezone.utc)
    monday = value - timedelta(days=value.weekday())
    return monday.replace(hour=12, minute=0, second=0, microsecond=0)


def _period_calendar(period: str, now: Optional[datetime] = None) -> list[dict[str, Optional[str]]]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    buckets: list[dict[str, Optional[str]]] = []
    if period == "weekly":
        start = _week_anchor(now)
        for index in range(12):
            cursor = start - timedelta(days=(11 - index) * 7)
            buckets.append(next(item for item in period_buckets(cursor) if item["period"] == "week"))
        return buckets
    if period == "monthly":
        year, month = now.year, now.month
        cursors: list[datetime] = []
        for _ in range(12):
            cursors.append(datetime(year, month, 15, 12, tzinfo=timezone.utc))
            month -= 1
            if month == 0:
                month = 12
                year -= 1
        for cursor in reversed(cursors):
            buckets.append(next(item for item in period_buckets(cursor) if item["period"] == "month"))
        return buckets
    year = now.year
    for index in range(5):
        cursor = datetime(year - (4 - index), 6, 15, 12, tzinfo=timezone.utc)
        buckets.append(next(item for item in period_buckets(cursor) if item["period"] == "year"))
    return buckets


async def get_sales_period_series(*, affiliate_id: str, period: str) -> dict[str, Any]:
    """Return stored week/month/year snapshots for the requested filter. No order scan."""
    prefix = {"weekly": "WEEK#", "monthly": "MONTH#", "yearly": "YEAR#"}[period]
    pk = SalesSnapshot.affiliate_pk(affiliate_id)
    stored = await _query_snapshots(pk, prefix)
    totals_item = await _get_snapshot(pk, "TOTAL")
    currency = (totals_item or {}).get("currency") or "USD"
    by_key = {item.get("period_key"): item for item in stored}
    series: list[dict[str, Any]] = []
    for bucket in _period_calendar(period):
        snapshot = public_snapshot(by_key.get(bucket["period_key"]), currency=currency)
        snapshot["period"] = bucket["period"]
        snapshot["period_key"] = bucket["period_key"] or snapshot["period_key"]
        snapshot["label"] = bucket["label"] or snapshot["label"]
        snapshot["starts_at"] = bucket["starts_at"]
        series.append(snapshot)
    current = series[-1] if series else empty_snapshot(currency=currency)
    return {
        "period": period,
        "currency": currency,
        "current": current,
        "series": series,
        "totals": public_snapshot(totals_item, currency=currency),
    }
