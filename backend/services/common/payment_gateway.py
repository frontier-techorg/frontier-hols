"""Payment processor hook.

Development skips the live gateway and records a successful charge so orders
and membership still complete. Production calls ``charge_with_gateway``,
which is an empty stub until a processor is integrated.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, status

from config import settings
from models.common import ErrorCodes

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CardChargeRequest:
    user_id: str
    amount: float
    currency: str
    plan_type: str
    order_id: str
    payment_method_id: Optional[str] = None
    card_last4: Optional[str] = None


@dataclass(frozen=True)
class CardChargeResult:
    success: bool
    transaction_id: str
    bypassed: bool
    message: str = ""


async def process_card_charge(request: CardChargeRequest) -> CardChargeResult:
    """Charge for a plan purchase, then the caller records the paid order."""
    if settings.is_development():
        return await bypass_card_charge(request)
    return await charge_with_gateway(request)


async def bypass_card_charge(request: CardChargeRequest) -> CardChargeResult:
    """Development: do not call a processor; treat the charge as paid."""
    transaction_id = f"bypass_{request.order_id}"
    logger.info(
        "Payment gateway bypassed env=development user_id=%s order_id=%s amount=%s %s",
        request.user_id,
        request.order_id,
        request.amount,
        request.currency,
    )
    return CardChargeResult(
        success=True,
        transaction_id=transaction_id,
        bypassed=True,
        message="Payment processor bypassed in development.",
    )


async def charge_with_gateway(request: CardChargeRequest) -> CardChargeResult:
    """Production payment processor.

    Integrate Stripe (or another gateway) here later. Until then this stub
    refuses the charge so production never marks an order paid without a
    real processor response.
    """
    _ = request
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={
            "error": "Payment gateway is not configured yet.",
            "error_code": ErrorCodes.PAYMENT_FAILED,
        },
    )


# Back-compat alias for older imports.
charge_card_with_gateway = charge_with_gateway
