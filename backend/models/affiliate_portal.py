"""API schemas for affiliate self-service routes."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field, model_validator

from models.common import ApiSuccessResponse
from models.sales import SalesSnapshotData
from models.users import PaginationMeta, StudentSummary


class AffiliateInviteUrlData(BaseModel):
    affiliate_id: str
    invite_code: Optional[str] = None
    signup_path: str
    public_url: str
    student_count: int = 0
    invitation_quota: Optional[int] = None


class AffiliateInviteResolveData(BaseModel):
    affiliate_id: str
    invite_code: str
    first_name: str
    last_name: str
    student_count: int = 0
    invitation_quota: Optional[int] = None


class AffiliateInviteRequest(BaseModel):
    email: Optional[EmailStr] = None
    emails: Optional[list[EmailStr]] = Field(default=None, min_length=1, max_length=50)
    message: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def require_email_or_emails(self) -> "AffiliateInviteRequest":
        if self.email is None and not self.emails:
            raise ValueError("Provide email or emails")
        return self

    def normalized_emails(self) -> list[str]:
        values: list[str] = []
        if self.email is not None:
            values.append(str(self.email).lower())
        if self.emails:
            values.extend(str(email).lower() for email in self.emails)
        return list(dict.fromkeys(values))


class AffiliateInviteEmailData(BaseModel):
    queued: bool = True
    public_url: str
    recipients: list[str]
    recipient_count: int


class AffiliateReferralTotals(BaseModel):
    student_count: int = 0
    total_spent: float = 0
    affiliate_earned: float = 0
    currency: str = "USD"


class AffiliateReferralStudentListData(BaseModel):
    items: list[StudentSummary]
    pagination: PaginationMeta
    totals: AffiliateReferralTotals = Field(default_factory=AffiliateReferralTotals)


class AffiliateCommissionItem(BaseModel):
    order_id: str
    student_user_id: Optional[str] = None
    plan_type: Optional[str] = None
    amount: float = 0
    commission: float = 0
    currency: str = "USD"
    status: str
    created_at: Optional[str] = None
    unlock_at: Optional[str] = None


class AffiliateWalletData(BaseModel):
    total_earned: float = 0
    lock_amount: float = 0
    available: float = 0
    pending: float = 0
    paid_out: float = 0
    order_count: int = 0
    order_volume: float = 0
    currency: str = "USD"
    updated_at: Optional[str] = None


class AffiliateEarningsData(BaseModel):
    """Stored wallet balances plus recent commission ledger rows."""

    total_earned: float = 0
    lock_amount: float = 0
    available: float = 0
    pending_payout: float = 0
    paid_out: float = 0
    currency: str = "USD"
    order_count: int = 0
    payout_lock_days: int = 7
    margin_percent: Optional[float] = None
    next_milestone: float = 100
    items: list[AffiliateCommissionItem] = Field(default_factory=list)


class AffiliateTimeseriesData(BaseModel):
    period: str
    currency: str = "USD"
    current: SalesSnapshotData
    series: list[SalesSnapshotData] = Field(default_factory=list)


class AffiliateDashboardData(BaseModel):
    period: str
    wallet: AffiliateWalletData
    payout_lock_days: int = 7
    payout_lock_seconds: int = 0
    timeseries: AffiliateTimeseriesData
    totals: SalesSnapshotData
    recent_commissions: list[AffiliateCommissionItem] = Field(default_factory=list)
    margin_percent: Optional[float] = None
    student_count: int = 0
    invite_code: Optional[str] = None
    currency: str = "USD"


class AffiliatePayoutItem(BaseModel):
    payout_id: str
    affiliate_id: Optional[str] = None
    affiliate_name: Optional[str] = None
    affiliate_email: Optional[str] = None
    amount: float
    currency: str = "USD"
    status: str
    created_at: Optional[str] = None
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None


class AffiliatePayoutOverviewData(BaseModel):
    wallet: AffiliateWalletData
    payout_lock_days: int = 7
    payout_lock_seconds: int = 0
    student_count: int = 0
    payouts: list[AffiliatePayoutItem] = Field(default_factory=list)


class AffiliatePayoutRequest(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)


class AffiliatePayoutResultData(BaseModel):
    payout: AffiliatePayoutItem
    wallet: AffiliateWalletData


class AdminPayoutOverviewData(BaseModel):
    items: list[AffiliatePayoutItem] = Field(default_factory=list)
    pagination: PaginationMeta
    pending_count: int = 0
    pending_amount: float = 0
    paid_amount: float = 0
    rejected_count: int = 0
    currency: str = "USD"


class AdminPayoutReviewData(BaseModel):
    payout: AffiliatePayoutItem


class PayoutSettingsData(BaseModel):
    payout_lock_days: int
    payout_lock_seconds: int = 0
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None


class PayoutSettingsUpdateRequest(BaseModel):
    payout_lock_days: int = Field(ge=0, le=365)


AffiliateInviteUrlResponse = ApiSuccessResponse[AffiliateInviteUrlData]
AffiliateInviteResolveResponse = ApiSuccessResponse[AffiliateInviteResolveData]
AffiliateInviteEmailResponse = ApiSuccessResponse[AffiliateInviteEmailData]
AffiliateReferralStudentListResponse = ApiSuccessResponse[AffiliateReferralStudentListData]
AffiliateEarningsResponse = ApiSuccessResponse[AffiliateEarningsData]
AffiliateDashboardResponse = ApiSuccessResponse[AffiliateDashboardData]
AffiliatePayoutOverviewResponse = ApiSuccessResponse[AffiliatePayoutOverviewData]
AffiliatePayoutResultResponse = ApiSuccessResponse[AffiliatePayoutResultData]
AdminPayoutOverviewResponse = ApiSuccessResponse[AdminPayoutOverviewData]
AdminPayoutReviewResponse = ApiSuccessResponse[AdminPayoutReviewData]
PayoutSettingsResponse = ApiSuccessResponse[PayoutSettingsData]
