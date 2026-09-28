"""Admin affiliate management routes."""

import asyncio
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, Query, status

from core.route_handlers import handle_route_errors
from database_entities import UserRole
from dependencies import CurrentUser, require_roles
from models.affiliate_portal import (
    AdminPayoutOverviewData,
    AdminPayoutOverviewResponse,
    AdminPayoutReviewData,
    AdminPayoutReviewResponse,
    AffiliateEarningsData,
    AffiliateEarningsResponse,
    AffiliateReferralStudentListData,
    AffiliateReferralStudentListResponse,
    PayoutSettingsData,
    PayoutSettingsResponse,
    PayoutSettingsUpdateRequest,
)
from models.affiliates import (
    AffiliateCreateData,
    AffiliateCreateRequest,
    AffiliateCreateResponse,
    AffiliateDetailData,
    AffiliateDetailResponse,
    AffiliateListResponse,
    AffiliateQuotaUpdateData,
    AffiliateQuotaUpdateRequest,
    AffiliateQuotaUpdateResponse,
)
from models.common import success_response
from models.users import AffiliateListData
from services.routes.affiliate_portal import service as affiliate_portal_service
from services.routes.affiliates import service as affiliates_service
from services.routes.payout import service as payout_service

router = APIRouter(prefix="/admin/affiliates", tags=["admin-affiliates"])


@router.post(
    "",
    response_model=AffiliateCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
@handle_route_errors("create affiliate account", log_prefix="Affiliates")
async def create_affiliate(
    body: AffiliateCreateRequest,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
) -> AffiliateCreateResponse:
    """Admin - create an affiliate account and email login credentials."""
    _ = current_user
    result = await affiliates_service.create_affiliate(
        email=str(body.email),
        password=body.password,
        first_name=body.first_name,
        last_name=body.last_name,
        margin_percent=body.margin_percent,
        invitation_quota=body.invitation_quota,
    )
    email_payload = result.pop("_credential_email")
    asyncio.create_task(
        affiliates_service.send_affiliate_credentials_email(
            email_payload["user"],
            email_payload["password"],
        ),
    )
    profile = result["profile"]
    return success_response(
        AffiliateCreateData(
            user_id=profile["user_id"],
            profile=profile,
            credential_email_queued=True,
        ),
    )


@router.get("", response_model=AffiliateListResponse)
@handle_route_errors("list affiliates", log_prefix="Affiliates")
async def list_affiliates(
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    sort: Literal["newest", "oldest"] = Query(default="newest"),
    empty_referrals: bool = Query(default=False),
) -> AffiliateListResponse:
    """Admin - list affiliates with total affiliated students."""
    _ = current_user
    result = await affiliates_service.list_affiliates(
        page=page,
        limit=limit,
        cursor=cursor,
        sort=sort,
        empty_referrals=empty_referrals,
    )
    return success_response(AffiliateListData(**result))


@router.get("/payouts", response_model=AdminPayoutOverviewResponse)
@handle_route_errors("list affiliate payout requests", log_prefix="Affiliates")
async def list_admin_payouts(
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=100),
) -> AdminPayoutOverviewResponse:
    """Admin — payout requests, newest pending first, one page at a time."""
    _ = current_user
    result = await payout_service.list_admin_payouts(page=page, limit=limit)
    return success_response(AdminPayoutOverviewData(**result))


@router.post("/payouts/{payout_id}/accept", response_model=AdminPayoutReviewResponse)
@handle_route_errors("accept affiliate payout", log_prefix="Affiliates")
async def accept_admin_payout(
    payout_id: str,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
) -> AdminPayoutReviewResponse:
    """Admin — pay out a pending request and move funds from pending to paid out."""
    result = await payout_service.review_payout(
        payout_id=payout_id,
        action="accept",
        admin_user_id=current_user.user_id,
    )
    return success_response(AdminPayoutReviewData(**result))


@router.post("/payouts/{payout_id}/reject", response_model=AdminPayoutReviewResponse)
@handle_route_errors("reject affiliate payout", log_prefix="Affiliates")
async def reject_admin_payout(
    payout_id: str,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
) -> AdminPayoutReviewResponse:
    """Admin — reject a pending request and return funds to available."""
    result = await payout_service.review_payout(
        payout_id=payout_id,
        action="reject",
        admin_user_id=current_user.user_id,
    )
    return success_response(AdminPayoutReviewData(**result))


@router.get("/payout-settings", response_model=PayoutSettingsResponse)
@handle_route_errors("get payout lock settings", log_prefix="Affiliates")
async def get_payout_settings(
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
) -> PayoutSettingsResponse:
    """Admin — days commission stays locked before it can be paid out."""
    _ = current_user
    result = await payout_service.get_payout_settings()
    return success_response(PayoutSettingsData(**result))


@router.put("/payout-settings", response_model=PayoutSettingsResponse)
@handle_route_errors("update payout lock settings", log_prefix="Affiliates")
async def update_payout_settings(
    body: PayoutSettingsUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
) -> PayoutSettingsResponse:
    """Admin — set how many days new commission stays locked."""
    result = await payout_service.update_payout_settings(
        payout_lock_days=body.payout_lock_days,
        admin_user_id=current_user.user_id,
    )
    return success_response(PayoutSettingsData(**result))


@router.get("/{affiliate_id}", response_model=AffiliateDetailResponse)
@handle_route_errors("get affiliate", log_prefix="Affiliates")
async def get_affiliate(
    affiliate_id: str,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
) -> AffiliateDetailResponse:
    """Admin - view one affiliate and their total affiliated students."""
    _ = current_user
    affiliate = await affiliates_service.get_affiliate(affiliate_id)
    return success_response(AffiliateDetailData(affiliate=affiliate))


@router.get("/{affiliate_id}/students", response_model=AffiliateReferralStudentListResponse)
@handle_route_errors("list affiliate students for admin", log_prefix="Affiliates")
async def list_admin_affiliate_students(
    affiliate_id: str,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    sort: Literal["newest", "oldest"] = Query(default="newest"),
    empty_orders: bool = Query(default=False),
) -> AffiliateReferralStudentListResponse:
    """Admin — students referred by one affiliate, with spend and earnings."""
    _ = current_user
    result = await affiliate_portal_service.list_referred_students(
        affiliate_id=affiliate_id,
        page=page,
        limit=limit,
        cursor=cursor,
        sort=sort,
        empty_orders=empty_orders,
    )
    return success_response(AffiliateReferralStudentListData(**result))


@router.get("/{affiliate_id}/earnings", response_model=AffiliateEarningsResponse)
@handle_route_errors("get affiliate earnings for admin", log_prefix="Affiliates")
async def get_affiliate_earnings_admin(
    affiliate_id: str,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
    history_limit: int = Query(default=25, ge=1, le=500),
) -> AffiliateEarningsResponse:
    """Admin — commission totals + recent line items for one affiliate."""
    _ = current_user
    result = await affiliate_portal_service.get_earnings(
        affiliate_id=affiliate_id,
        history_limit=history_limit,
    )
    return success_response(AffiliateEarningsData(**result))


@router.patch(
    "/{affiliate_id}/invitation-quota",
    response_model=AffiliateQuotaUpdateResponse,
)
@handle_route_errors("update affiliate invitation quota", log_prefix="Affiliates")
async def update_affiliate_invitation_quota(
    affiliate_id: str,
    body: AffiliateQuotaUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(require_roles(UserRole.ADMIN))],
) -> AffiliateQuotaUpdateResponse:
    """Admin - change how many student invitations an affiliate can use."""
    _ = current_user
    affiliate = await affiliates_service.update_invitation_quota(
        affiliate_id,
        body.invitation_quota,
    )
    return success_response(AffiliateQuotaUpdateData(affiliate=affiliate))
