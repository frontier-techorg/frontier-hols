"""API schemas for payment routes."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from database_entities import PlanType
from models.common import ApiSuccessResponse
from models.users import PaginationMeta


class PlanUpdateRequest(BaseModel):
    price: float = Field(gt=0)


class PurchasePlanRequest(BaseModel):
    plan_type: PlanType


class PlanListData(BaseModel):
    items: list[dict[str, Any]]


class PlanUpdateData(BaseModel):
    plan: dict[str, Any]


class PurchasePlanData(BaseModel):
    order: dict[str, Any]
    membership: Optional[dict[str, Any]] = None


class MembershipData(BaseModel):
    membership: Optional[dict[str, Any]] = None


class OrderHistoryData(BaseModel):
    items: list[dict[str, Any]]
    pagination: PaginationMeta


class OrderDetailData(BaseModel):
    order: dict[str, Any]


class StudentCommerceData(BaseModel):
    user_id: str
    total_spent: float = 0
    admin_earned: float = 0
    order_count: int = 0
    paid_order_count: int = 0
    currency: str = "USD"
    last_purchase_at: Optional[str] = None
    last_purchase_amount: Optional[float] = None
    last_plan_type: Optional[str] = None
    current_plan: Optional[str] = None
    membership_status: Optional[str] = None
    membership_end_date: Optional[str] = None
    affiliate_earned: float = 0


PlanListResponse = ApiSuccessResponse[PlanListData]
PlanUpdateResponse = ApiSuccessResponse[PlanUpdateData]
PurchasePlanResponse = ApiSuccessResponse[PurchasePlanData]
MembershipResponse = ApiSuccessResponse[MembershipData]
OrderHistoryResponse = ApiSuccessResponse[OrderHistoryData]
OrderDetailResponse = ApiSuccessResponse[OrderDetailData]
StudentCommerceResponse = ApiSuccessResponse[StudentCommerceData]
