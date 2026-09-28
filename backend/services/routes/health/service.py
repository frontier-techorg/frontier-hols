"""Health route service — liveness and test endpoints."""


from config import settings


def get_health() -> dict[str, str | bool]:
    development = settings.is_development()
    return {
        "status": "ok",
        "message": "HOLS API is running",
        "environment": settings.environment_name(),
        "otp_required": settings.enable_otp,
        "payment_required": True,
        "payment_gateway_bypass": development,
    }


def get_test() -> dict[str, str | bool]:
    return {
        "success": True,
        "data": "Backend test route is working",
    }
