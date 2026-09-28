from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from core.exceptions import register_exception_handlers
from core.logging_config import setup_logging
from core.middleware import ApiResponseMiddleware, RequestLoggingMiddleware
from database import create_table_async
from routes import (
    affiliate_portal_router,
    affiliates_router,
    auth_router,
    chat_router,
    health_router,
    lectures_router,
    notifications_router,
    payment_router,
    reports_router,
    users_router,
    webinars_router,
)
from services.notification.service import run_cleanup_loop
from services.routes.chat import service as chat_service
from services.routes.payment.service import ensure_default_plans
from services.routes.payout.service import ensure_payout_settings, run_unlock_loop

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(level=settings.log_level, log_format=settings.log_format)  # type: ignore[arg-type]
    logger.info("Starting HOLS API")
    if settings.is_development():
        logger.warning("Development mode: the payment gateway is bypassed")
    if not settings.enable_otp:
        logger.warning("ENABLE_OTP is false: login will not require an OTP code")
    await create_table_async()
    await ensure_default_plans()
    await ensure_payout_settings()
    chat_service.ensure_initialized()
    stop_unlock = asyncio.Event()
    unlock_task = asyncio.create_task(run_unlock_loop(stop_unlock), name="payout-unlock")
    stop_notify_cleanup = asyncio.Event()
    notify_cleanup_task = asyncio.create_task(
        run_cleanup_loop(stop_notify_cleanup),
        name="notification-cleanup",
    )
    logger.info("Startup complete")
    try:
        yield
    finally:
        stop_unlock.set()
        stop_notify_cleanup.set()
        unlock_task.cancel()
        notify_cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await unlock_task
        with suppress(asyncio.CancelledError):
            await notify_cleanup_task
        logger.info("Shutting down HOLS API")


app = FastAPI(
    title="House of Life Sciences API",
    description="Backend API for HOLS",
    version="0.1.0",
    lifespan=lifespan,
)

register_exception_handlers(app)

app.add_middleware(ApiResponseMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api", tags=["health"])
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(affiliates_router, prefix="/api")
app.include_router(affiliate_portal_router, prefix="/api")
app.include_router(payment_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(lectures_router, prefix="/api")
app.include_router(webinars_router, prefix="/api")
app.include_router(chat_router, prefix="/api")


@app.api_route("/", methods=["GET", "HEAD"])
async def root() -> dict[str, str]:
    return {"message": "Welcome to HOLS API", "docs": "/docs"}
