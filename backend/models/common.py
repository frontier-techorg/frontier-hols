"""Standard API response envelope used across the application."""

from __future__ import annotations

from typing import Any, Generic, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ApiSuccessResponse(BaseModel, Generic[T]):
    status: Literal[True] = True
    response: T


class ApiErrorResponse(BaseModel):
    status: Literal[False] = False
    error: str
    error_code: str


class ErrorCodes:
    BAD_REQUEST = "BAD_REQUEST"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    MEMBERSHIP_REQUIRED = "MEMBERSHIP_REQUIRED"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


STATUS_TO_ERROR_CODE: dict[int, str] = {
    400: ErrorCodes.BAD_REQUEST,
    401: ErrorCodes.UNAUTHORIZED,
    402: ErrorCodes.PAYMENT_FAILED,
    403: ErrorCodes.FORBIDDEN,
    404: ErrorCodes.NOT_FOUND,
    409: ErrorCodes.CONFLICT,
    422: ErrorCodes.VALIDATION_ERROR,
    500: ErrorCodes.INTERNAL_ERROR,
    502: ErrorCodes.PAYMENT_FAILED,
    503: ErrorCodes.PAYMENT_FAILED,
}


def success_response(data: Any) -> dict[str, Any]:
    """Build a standard success envelope."""
    if isinstance(data, BaseModel):
        payload = data.model_dump()
    else:
        payload = data
    return {"status": True, "response": payload}


def error_response(
    error: str,
    error_code: str,
    status_code: int = 400,
) -> dict[str, Any]:
    """Build a standard error envelope."""
    return {
        "status": False,
        "error": error,
        "error_code": error_code or STATUS_TO_ERROR_CODE.get(status_code, ErrorCodes.BAD_REQUEST),
    }


def parse_http_exception_detail(detail: Any, status_code: int) -> tuple[str, str]:
    """Normalise FastAPI HTTPException detail into error message + code."""
    if isinstance(detail, dict):
        error = str(detail.get("error") or detail.get("message") or "Request failed")
        error_code = str(
            detail.get("error_code")
            or STATUS_TO_ERROR_CODE.get(status_code, ErrorCodes.BAD_REQUEST)
        )
        return error, error_code

    if isinstance(detail, list):
        field_labels = {
            "join_url": "Join URL",
            "capacity": "Capacity",
            "starts_at": "Start time",
            "title": "Title",
        }
        messages = []
        for item in detail:
            if isinstance(item, dict):
                loc_parts = [str(part) for part in item.get("loc", []) if part != "body"]
                field = loc_parts[-1] if loc_parts else ""
                label = field_labels.get(field, field.replace("_", " ").title() if field else "Field")
                msg = str(item.get("msg") or "Invalid value")
                # Soften pydantic jargon for the UI.
                msg = msg.replace("String should have at least", "Must be at least")
                msg = msg.replace("String should have at most", "Must be at most")
                msg = msg.replace("Input should be a valid integer", "Enter a whole number")
                msg = msg.replace("Value error, ", "")
                messages.append(f"{label}: {msg}")
            else:
                messages.append(str(item))
        return "; ".join(messages) or "Please check the highlighted fields.", ErrorCodes.VALIDATION_ERROR

    message = str(detail) if detail else "Request failed"
    return message, STATUS_TO_ERROR_CODE.get(status_code, ErrorCodes.BAD_REQUEST)
