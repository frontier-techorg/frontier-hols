"""Payment routes — plans, purchase, orders."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query

from core.route_handlers import handle_route_errors
from database_entities import PlanType, UserRole
from dependencies import CurrentUser, require_roles
from models.common import success_response
from models.payment import (
    MembershipData,
    MembershipResponse,
    OrderDetailData,
    OrderDetailResponse,
    OrderHistoryData,
    OrderHistoryResponse,
    PlanListData,
    PlanListResponse,
    PlanUpdateData,
    PlanUpdateRequest,
    PlanUpdateResponse,
    PurchasePlanData,
    PurchasePlanRequest,
    PurchasePlanResponse,
    StudentCommerceData,
    StudentCommerceResponse,
)
from models.sales import SalesOverviewData, SalesOverviewResponse
from services.routes.payment import service as payment_service
from services.routes.sales import service as sales_service

router = APIRouter(prefix="/payment", tags=["payment"])


@router.get("/plans", response_model=PlanListResponse)
@handle_route_errors("list plans", log_prefix="Payment")
async def list_plans(
    current_user: Annotated[
        CurrentUser,
        Depends(require_roles(UserRole.STUDENT, UserRole.ADMIN)),
    ],
) -> PlanListResponse:
    """View available membership plans."""
    _ = current_user
    return success_response(PlanListData(items=await payment_service.list_plans()))


@router.put("/plans/{plan_type}", response_model=PlanUpdateResponse)
@handle_route_errors("update plan price", log_prefix="Payment")
async def update_plan_price(
    plan_type: PlanType,
    body: PlanUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
) -> PlanUpdateResponse:
    """Admin — update plan price."""
    plan = await payment_service.update_plan_price(
        plan_type=plan_type,
        price=body.price,
        admin_user_id=current_user.user_id,
    )
    return success_response(PlanUpdateData(plan=plan))


@router.post("/purchase", response_model=PurchasePlanResponse)
@handle_route_errors("purchase plan", log_prefix="Payment")
async def purchase_plan(
    body: PurchasePlanRequest,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.STUDENT))],
) -> PurchasePlanResponse:
    """Student — purchase a membership plan (no saved card required)."""
    result = await payment_service.purchase_plan(
        user_id=current_user.user_id,
        plan_type=body.plan_type,
    )
    return success_response(PurchasePlanData(**result))


@router.get("/membership/current", response_model=MembershipResponse)
@handle_route_errors("get current membership", log_prefix="Payment")
async def get_current_membership(
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.STUDENT))],
) -> MembershipResponse:
    """Student — view current active plan."""
    membership = await payment_service.get_membership(current_user.user_id)
    return success_response(MembershipData(membership=membership))


@router.get("/orders", response_model=OrderHistoryResponse)
@handle_route_errors("list order history", log_prefix="Payment")
async def list_order_history(
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.STUDENT))],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
) -> OrderHistoryResponse:
    """Student — paginated order history."""
    result = await payment_service.list_orders(
        user_id=current_user.user_id,
        page=page,
        limit=limit,
        cursor=cursor,
    )
    return success_response(OrderHistoryData(**result))


@router.get("/orders/item/{order_id}", response_model=OrderDetailResponse)
@handle_route_errors("get order", log_prefix="Payment")
async def get_order(
    order_id: str,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.STUDENT))],
) -> OrderDetailResponse:
    """Student — one order, used by the invoice page."""
    order = await payment_service.get_order(current_user.user_id, order_id)
    return success_response(OrderDetailData(order=order))


@router.get("/orders/{user_id}", response_model=OrderHistoryResponse)
@handle_route_errors("list student orders for admin", log_prefix="Payment")
async def list_student_orders_admin(
    user_id: str,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
) -> OrderHistoryResponse:
    """Admin — paginated order history for any student."""
    _ = current_user
    result = await payment_service.list_orders(
        user_id=user_id,
        page=page,
        limit=limit,
        cursor=cursor,
        include_affiliate=True,
    )
    return success_response(OrderHistoryData(**result))


@router.get("/commerce", response_model=StudentCommerceResponse)
@handle_route_errors("get my commerce summary", log_prefix="Payment")
async def get_my_commerce(
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.STUDENT))],
) -> StudentCommerceResponse:
    """Student — stored sales and order totals."""
    summary = await payment_service.get_student_commerce_summary(current_user.user_id)
    return success_response(StudentCommerceData(**summary))


@router.get("/students/{user_id}/commerce", response_model=StudentCommerceResponse)
@handle_route_errors("get student commerce summary", log_prefix="Payment")
async def get_student_commerce(
    user_id: str,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
) -> StudentCommerceResponse:
    """Admin — spend totals + current membership for one student."""
    _ = current_user
    summary = await payment_service.get_student_commerce_summary(user_id)
    return success_response(StudentCommerceData(**summary))


@router.get("/sales", response_model=SalesOverviewResponse)
@handle_route_errors("get admin sales overview", log_prefix="Payment")
async def get_admin_sales(
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
) -> SalesOverviewResponse:
    """Admin — stored weekly, monthly, and yearly sales, revenue, and profit."""
    _ = current_user
    overview = await sales_service.get_admin_sales_overview()
    return success_response(SalesOverviewData(**overview))
