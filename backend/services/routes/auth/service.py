"""Authentication service — signup, login, OTP, JWT tokens, profile."""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

import jwt
from boto3.dynamodb.conditions import Key
from fastapi import HTTPException, status

from config import settings
from core.async_io import run_sync
from database import get_table
from database_entities import (
    Address,
    OtpSession,
    RefreshTokenRecord,
    UserProfile,
    UserRole,
    now_iso,
)
from services.common import email as email_service
from services.common import s3bucket
from services.common.profile_access import (
    build_access_info,
    can_edit_profile,
    can_view_profile,
    editable_fields_for,
    ENDPOINT_ACCESS,
    filter_profile_for_view,
)

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"
TOKEN_TYPE_OTP_CHALLENGE = "otp_challenge"
PASSWORD_HASH_ITERATIONS = 260_000
MAX_PROFILE_PIC_BYTES = 5 * 1024 * 1024
ALLOWED_PROFILE_PIC_TYPES = s3bucket.IMAGE_CONTENT_TYPES

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Password helpers
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_HASH_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${salt}${digest}"


def verify_password(plain: str, hashed: str) -> bool:
    try:
        algorithm, iterations, salt, expected = hashed.split("$", 3)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        plain.encode("utf-8"),
        salt.encode("utf-8"),
        int(iterations),
    ).hex()
    return hmac.compare_digest(digest, expected)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
# DynamoDB access
# --------------------------------------------------------------------------- #
def _table():
    return get_table()


def user_role_index_item(user: dict[str, Any]) -> dict[str, Any]:
    role = user.get("role")
    user_id = user.get("user_id")
    created_at = user.get("created_at") or now_iso()
    item = {
        "PK": f"ROLE#{role}",
        "SK": f"USER#{created_at}#{user_id}",
        "entity": "USER_ROLE_INDEX",
        "user_id": user_id,
        "role": role,
        "email": user.get("email"),
        "first_name": user.get("first_name"),
        "last_name": user.get("last_name"),
        "marketing_pref": user.get("marketing_pref", False),
        "referred_by_affiliate_id": user.get("referred_by_affiliate_id"),
        "margin_percent": user.get("margin_percent"),
        "invite_code": user.get("invite_code"),
        "invitation_quota": user.get("invitation_quota"),
        "student_count": user.get("student_count", 0) if role == UserRole.AFFILIATE.value else None,
        "created_at": created_at,
    }
    if role == UserRole.STUDENT.value:
        item.update(
            {
                "total_spent": user.get("total_spent", 0),
                "admin_earned": user.get("admin_earned", 0),
                "order_count": user.get("order_count", 0),
                "paid_order_count": user.get("paid_order_count", 0),
                "spend_currency": user.get("spend_currency"),
                "last_purchase_at": user.get("last_purchase_at"),
                "last_purchase_amount": user.get("last_purchase_amount"),
                "last_plan_type": user.get("last_plan_type"),
                "current_plan": user.get("current_plan"),
                "membership_status": user.get("membership_status"),
                "membership_end_date": user.get("membership_end_date"),
            }
        )
    return {key: value for key, value in item.items() if value is not None}


def user_role_count_key(role: str) -> dict[str, str]:
    return {"PK": f"ROLE#{role}", "SK": "COUNT"}


def role_count_item(role: str, total: int) -> dict[str, Any]:
    return {
        **user_role_count_key(role),
        "entity": "USER_ROLE_COUNT",
        "role": role,
        "total": total,
    }


def _clear_user_list_cache() -> None:
    try:
        from services.routes.users import service as users_service

        users_service.clear_user_list_cache()
    except Exception:
        logger.debug("Could not clear user list cache", exc_info=True)


async def get_user_by_email(email: str) -> Optional[dict[str, Any]]:
    def _fetch():
        response = _table().query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq(f"EMAIL#{email.lower()}"),
        )
        items = response.get("Items", [])
        return items[0] if items else None

    return await run_sync(_fetch)


async def get_user_by_id(user_id: str) -> Optional[dict[str, Any]]:
    def _fetch():
        response = _table().get_item(
            Key={"PK": UserProfile.pk(user_id), "SK": UserProfile.sk()},
        )
        return response.get("Item")

    return await run_sync(_fetch)


async def save_user(profile: UserProfile) -> dict[str, Any]:
    item = profile.to_item()

    def _save():
        table = _table()
        with table.batch_writer() as batch:
            batch.put_item(Item=item)
            batch.put_item(Item=user_role_index_item(item))
        table.update_item(
            Key=user_role_count_key(item["role"]),
            UpdateExpression=(
                "SET #entity = :entity, #role = :role, #total = if_not_exists(#total, :zero) + :inc"
            ),
            ExpressionAttributeNames={
                "#entity": "entity",
                "#role": "role",
                "#total": "total",
            },
            ExpressionAttributeValues={
                ":entity": "USER_ROLE_COUNT",
                ":role": item["role"],
                ":zero": 0,
                ":inc": 1,
            },
        )
        return item

    saved = await run_sync(_save)
    _clear_user_list_cache()
    try:
        from services.routes.finance.service import bump_admin_role_count

        await bump_admin_role_count(saved.get("role"), delta=1)
    except Exception:
        logger.exception("Failed to bump admin role count after save user_id=%s", saved.get("user_id"))
    return saved


async def update_user_fields(user_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    existing_user = await get_user_by_id(user_id) if "role" in fields else None

    if not fields:
        user = await get_user_by_id(user_id)
        if not user:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        return user

    expr_names: dict[str, str] = {}
    expr_values: dict[str, Any] = {}
    parts: list[str] = []

    for idx, (key, value) in enumerate(fields.items()):
        if value is None:
            continue
        name_key = f"#k{idx}"
        value_key = f":v{idx}"
        expr_names[name_key] = key
        expr_values[value_key] = value
        parts.append(f"{name_key} = {value_key}")

    if not parts:
        user = await get_user_by_id(user_id)
        if not user:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        return user

    def _update():
        table = _table()
        response = table.update_item(
            Key={"PK": UserProfile.pk(user_id), "SK": UserProfile.sk()},
            UpdateExpression="SET " + ", ".join(parts),
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
            ReturnValues="ALL_NEW",
        )
        updated = response["Attributes"]
        if existing_user and existing_user.get("role") != updated.get("role"):
            old_index = user_role_index_item(existing_user)
            table.delete_item(Key={"PK": old_index["PK"], "SK": old_index["SK"]})
            table.update_item(
                Key=user_role_count_key(existing_user["role"]),
                UpdateExpression="SET #total = if_not_exists(#total, :zero) - :dec",
                ExpressionAttributeNames={"#total": "total"},
                ExpressionAttributeValues={":zero": 0, ":dec": 1},
            )
            table.update_item(
                Key=user_role_count_key(updated["role"]),
                UpdateExpression=(
                    "SET #entity = :entity, #role = :role, #total = if_not_exists(#total, :zero) + :inc"
                ),
                ExpressionAttributeNames={
                    "#entity": "entity",
                    "#role": "role",
                    "#total": "total",
                },
                ExpressionAttributeValues={
                    ":entity": "USER_ROLE_COUNT",
                    ":role": updated["role"],
                    ":zero": 0,
                    ":inc": 1,
                },
            )
        table.put_item(Item=user_role_index_item(updated))
        return updated

    updated_user = await run_sync(_update)
    _clear_user_list_cache()
    if existing_user and existing_user.get("role") != updated_user.get("role"):
        try:
            from services.routes.finance.service import bump_admin_role_count

            await bump_admin_role_count(existing_user.get("role"), delta=-1)
            await bump_admin_role_count(updated_user.get("role"), delta=1)
        except Exception:
            logger.exception(
                "Failed to adjust admin role counts after role change user_id=%s",
                user_id,
            )
    return updated_user


async def save_otp_session(session: OtpSession) -> None:
    item = session.to_item()
    await run_sync(_table().put_item, Item=item)


async def get_otp_session(user_id: str) -> Optional[dict[str, Any]]:
    def _fetch():
        response = _table().get_item(
            Key={"PK": OtpSession.pk(user_id), "SK": OtpSession.sk()},
        )
        return response.get("Item")

    return await run_sync(_fetch)


async def delete_otp_session(user_id: str) -> None:
    await run_sync(
        _table().delete_item,
        Key={"PK": OtpSession.pk(user_id), "SK": OtpSession.sk()},
    )


async def save_refresh_token(record: RefreshTokenRecord) -> None:
    item = record.to_item()
    await run_sync(_table().put_item, Item=item)


async def get_refresh_token(user_id: str, token_id: str) -> Optional[dict[str, Any]]:
    def _fetch():
        response = _table().get_item(
            Key={
                "PK": RefreshTokenRecord.pk(user_id),
                "SK": RefreshTokenRecord.sk(token_id),
            },
        )
        return response.get("Item")

    return await run_sync(_fetch)


async def delete_refresh_token(user_id: str, token_id: str) -> None:
    await run_sync(
        _table().delete_item,
        Key={
            "PK": RefreshTokenRecord.pk(user_id),
            "SK": RefreshTokenRecord.sk(token_id),
        },
    )


async def delete_all_refresh_tokens(user_id: str) -> int:
    kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(RefreshTokenRecord.pk(user_id))
        & Key("SK").begins_with("REFRESH#"),
        "ProjectionExpression": "PK, SK",
    }
    deleted = 0
    while True:
        query_kwargs = dict(kwargs)

        def _query(kw=query_kwargs):
            return _table().query(**kw)

        response = await run_sync(_query)
        for item in response.get("Items") or []:
            pk = item.get("PK")
            sk = item.get("SK")
            if not pk or not sk:
                continue
            await run_sync(_table().delete_item, Key={"PK": pk, "SK": sk})
            deleted += 1
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return deleted


# --------------------------------------------------------------------------- #
# JWT
# --------------------------------------------------------------------------- #
def _create_jwt(payload: dict[str, Any], expires_delta: timedelta) -> str:
    now = _utcnow()
    data = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(data, settings.jwt_secret_key, algorithm="HS256")


def create_access_token(user_id: str, role: str, email: str) -> str:
    return _create_jwt(
        {
            "sub": user_id,
            "role": role,
            "email": email,
            "type": TOKEN_TYPE_ACCESS,
        },
        timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )


async def create_refresh_token_value(user_id: str, role: str) -> tuple[str, str]:
    """Return (raw_token, token_id) and persist the hashed token."""
    token_id = uuid.uuid4().hex
    expires_at = (_utcnow() + timedelta(days=settings.jwt_refresh_token_expire_days)).isoformat()
    raw = secrets.token_urlsafe(48)
    record = RefreshTokenRecord(
        user_id=user_id,
        token_id=token_id,
        token_hash=_hash_token(raw),
        expires_at=expires_at,
    )
    await save_refresh_token(record)
    encoded = _create_jwt(
        {
            "sub": user_id,
            "role": role,
            "type": TOKEN_TYPE_REFRESH,
            "tid": token_id,
            "rt": raw,
        },
        timedelta(days=settings.jwt_refresh_token_expire_days),
    )
    return encoded, token_id


def create_otp_challenge_token(user_id: str, role: str, email: str) -> str:
    return _create_jwt(
        {
            "sub": user_id,
            "role": role,
            "email": email,
            "type": TOKEN_TYPE_OTP_CHALLENGE,
        },
        timedelta(seconds=settings.otp_expire_seconds),
    )


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token has expired",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid token",
        ) from exc

    if expected_type and payload.get("type") != expected_type:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
    return payload


def try_decode_token(token: Optional[str], expected_type: str | None = None) -> Optional[dict[str, Any]]:
    if not token:
        return None
    try:
        return decode_token(token, expected_type)
    except HTTPException:
        return None


# --------------------------------------------------------------------------- #
# OTP
# --------------------------------------------------------------------------- #
def _generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def otp_is_required(last_login_at: Optional[str], role: str) -> bool:
    """True when the user must verify OTP before receiving auth tokens.

    Applies to admin, affiliate, and student logins.
    """
    _ = role
    if settings.is_development():
        return False
    if not last_login_at:
        return True
    last_login = _parse_iso(last_login_at)
    elapsed = (_utcnow() - last_login).total_seconds()
    return elapsed >= settings.otp_required_after_seconds


_OTP_EMAIL_ACTIONS = {
    UserRole.ADMIN.value: "otp_verification_admin",
    UserRole.AFFILIATE.value: "otp_verification_affiliate",
    UserRole.STUDENT.value: "otp_verification_student",
}


async def send_otp_email(user: dict[str, Any], code: str) -> None:
    """Send the role-specific OTP email. Each template includes a login button."""
    first_name = user.get("first_name") or "there"
    try:
        role = user.get("role") or UserRole.STUDENT.value
        action = _OTP_EMAIL_ACTIONS.get(role, "otp_verification_student")
        email = email_service.render_email(
            action,
            recipient_name=first_name,
            otp_code=code,
            expiry_minutes=max(1, settings.otp_expire_seconds // 60),
        )
        await email_service.send_email_async(
            to=user["email"],
            subject=email["subject"],
            html_body=email["html_body"],
        )
    except Exception:
        logger.exception("Failed to send OTP email to %s", user.get("email"))


async def prepare_otp_challenge(user: dict[str, Any]) -> tuple[str, str]:
    """Create an OTP session and return ``(otp_token, plain_code)``."""
    code = _generate_otp_code()
    expires_at = (_utcnow() + timedelta(seconds=settings.otp_expire_seconds)).isoformat()
    session = OtpSession(
        user_id=user["user_id"],
        otp_hash=hash_password(code),
        expires_at=expires_at,
    )
    await save_otp_session(session)
    otp_token = create_otp_challenge_token(user["user_id"], user["role"], user["email"])
    return otp_token, code


async def create_and_send_otp(user: dict[str, Any]) -> str:
    """Legacy helper — prefer ``prepare_otp_challenge`` + background email."""
    otp_token, code = await prepare_otp_challenge(user)
    await send_otp_email(user, code)
    return otp_token


async def verify_otp_code(user_id: str, code: str) -> None:
    session = await get_otp_session(user_id)
    if not session:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active OTP session")

    if _parse_iso(session["expires_at"]) < _utcnow():
        await delete_otp_session(user_id)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "OTP has expired")

    if not verify_password(code, session["otp_hash"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid OTP code")

    await delete_otp_session(user_id)


# --------------------------------------------------------------------------- #
# Profile serialization
# --------------------------------------------------------------------------- #
def public_profile(user: dict[str, Any]) -> dict[str, Any]:
    """Strip sensitive fields before returning profile to the client."""
    hidden = {"PK", "SK", "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK", "password_hash", "entity"}
    return {k: v for k, v in user.items() if k not in hidden}


def _as_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return int(value)
    return int(value)


async def issue_tokens(user: dict[str, Any]) -> dict[str, Any]:
    access = create_access_token(user["user_id"], user["role"], user["email"])
    refresh, _ = await create_refresh_token_value(user["user_id"], user["role"])
    await update_user_fields(user["user_id"], {"last_login_at": now_iso(), "email_verified": True})
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": settings.jwt_access_token_expire_minutes * 60,
        "role": user["role"],
        "user_id": user["user_id"],
    }


# --------------------------------------------------------------------------- #
# Auth flows
# --------------------------------------------------------------------------- #
async def signup_student(
    email: str,
    password: str,
    first_name: str,
    last_name: str,
    marketing_pref: bool = False,
    referred_by_affiliate_id: Optional[str] = None,
) -> dict[str, Any]:
    if await get_user_by_email(email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    if referred_by_affiliate_id:
        affiliate = await get_user_by_id(referred_by_affiliate_id)
        if not affiliate or affiliate.get("role") != UserRole.AFFILIATE.value:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid affiliate id")
        invitation_quota = _as_int(affiliate.get("invitation_quota"))
        student_count = _as_int(affiliate.get("student_count")) or 0
        if invitation_quota is not None and student_count >= invitation_quota:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Affiliate invitation quota reached")

    user_id = uuid.uuid4().hex
    profile = UserProfile(
        user_id=user_id,
        role=UserRole.STUDENT,
        email=email,
        first_name=first_name,
        last_name=last_name,
        marketing_pref=marketing_pref,
        referred_by_affiliate_id=referred_by_affiliate_id,
        password_hash=hash_password(password),
    )
    user = await save_user(profile)
    referred_affiliate = None
    if referred_by_affiliate_id:
        await _increment_affiliate_student_count(referred_by_affiliate_id)
        referred_affiliate = await get_user_by_id(referred_by_affiliate_id)
    logger.info("Student signup completed for user_id=%s", user_id)
    try:
        from services.notification import events as notify_events

        notify_events.student_signed_up(student=user, affiliate=referred_affiliate)
    except Exception:
        logger.exception("Failed to queue student signup notifications user_id=%s", user_id)
    return public_profile(user)


async def _increment_affiliate_student_count(affiliate_id: str) -> None:
    affiliate = await get_user_by_id(affiliate_id)
    if not affiliate or affiliate.get("role") != UserRole.AFFILIATE.value:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid affiliate id")

    def _update():
        response = _table().update_item(
            Key={"PK": UserProfile.pk(affiliate_id), "SK": UserProfile.sk()},
            UpdateExpression="SET student_count = if_not_exists(student_count, :zero) + :inc",
            ExpressionAttributeValues={":zero": 0, ":inc": 1},
            ReturnValues="ALL_NEW",
        )
        updated = response["Attributes"]
        _table().put_item(Item=user_role_index_item(updated))

    await run_sync(_update)
    _clear_user_list_cache()


async def create_admin(
    email: str,
    password: str,
    first_name: str,
    last_name: str,
) -> dict[str, Any]:
    if await get_user_by_email(email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    user_id = uuid.uuid4().hex
    profile = UserProfile(
        user_id=user_id,
        role=UserRole.ADMIN,
        email=email,
        first_name=first_name,
        last_name=last_name,
        password_hash=hash_password(password),
        email_verified=True,
    )
    user = await save_user(profile)
    # Do not set last_login_at here — first login must still require OTP.
    logger.info("Admin account created for user_id=%s", user_id)
    return public_profile(user)


async def login(email: str, password: str, role: UserRole) -> dict[str, Any]:
    user = await get_user_by_email(email)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    if user.get("role") != role.value:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    password_hash = user.get("password_hash")
    if not password_hash or not verify_password(password, password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    if not otp_is_required(user.get("last_login_at"), user.get("role", "")):
        tokens = await issue_tokens(user)
        tokens["otp_required"] = False
        tokens["profile"] = public_profile(user)
        logger.info("Login completed for user_id=%s (no OTP)", user["user_id"])
        return tokens

    otp_token, code = await prepare_otp_challenge(user)
    logger.info("OTP challenge created for user_id=%s", user["user_id"])
    return {
        "otp_required": True,
        "otp_token": otp_token,
        "message": "OTP is being sent to your email. Verify to complete login.",
        "expires_in": settings.otp_expire_seconds,
        "_otp_email": {"user": user, "code": code},
    }


async def send_otp(otp_token: str) -> dict[str, Any]:
    payload = decode_token(otp_token, TOKEN_TYPE_OTP_CHALLENGE)
    user = await get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    new_otp_token, code = await prepare_otp_challenge(user)
    return {
        "otp_token": new_otp_token,
        "message": "OTP is being resent to your email.",
        "expires_in": settings.otp_expire_seconds,
        "_otp_email": {"user": user, "code": code},
    }


async def verify_otp(otp_token: str, code: str) -> dict[str, Any]:
    payload = decode_token(otp_token, TOKEN_TYPE_OTP_CHALLENGE)
    user_id = payload["sub"]
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    await verify_otp_code(user_id, code)
    tokens = await issue_tokens(user)
    tokens["otp_required"] = False
    tokens["profile"] = public_profile(user)
    logger.info("OTP verified for user_id=%s", user_id)
    return tokens


async def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    payload = decode_token(refresh_token, TOKEN_TYPE_REFRESH)
    user_id = payload["sub"]
    token_id = payload.get("tid")
    raw = payload.get("rt")

    if not token_id or not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    stored = await get_refresh_token(user_id, token_id)
    if not stored:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token revoked")

    if _parse_iso(stored["expires_at"]) < _utcnow():
        await delete_refresh_token(user_id, token_id)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")

    if stored["token_hash"] != _hash_token(raw):
        await delete_refresh_token(user_id, token_id)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    await delete_refresh_token(user_id, token_id)
    access = create_access_token(user_id, user["role"], user["email"])
    new_refresh, _ = await create_refresh_token_value(user_id, user["role"])

    return {
        "access_token": access,
        "refresh_token": new_refresh,
        "token_type": "bearer",
        "expires_in": settings.jwt_access_token_expire_minutes * 60,
    }


def _session_payload(
    user: dict[str, Any],
    *,
    access_token: str,
    refresh_token: str,
    expires_in: int,
) -> dict[str, Any]:
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "otp_required": False,
        "role": user["role"],
        "user_id": user["user_id"],
        "profile": public_profile(user),
    }


async def restore_session(*, refresh_token: str, access_token: Optional[str] = None) -> dict[str, Any]:
    """Return the current portal session from a stored refresh token."""
    payload = try_decode_token(refresh_token, TOKEN_TYPE_REFRESH)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    user_id = str(payload.get("sub") or "")
    token_id = payload.get("tid")
    raw = payload.get("rt")
    if not user_id or not token_id or not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    stored = await get_refresh_token(user_id, token_id)
    if not stored:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token revoked")
    if _parse_iso(stored["expires_at"]) < _utcnow():
        await delete_refresh_token(user_id, token_id)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")
    if stored["token_hash"] != _hash_token(raw):
        await delete_refresh_token(user_id, token_id)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    access_payload = try_decode_token(access_token, TOKEN_TYPE_ACCESS)
    if access_payload and str(access_payload.get("sub") or "") == user_id:
        remaining = max(1, int(access_payload.get("exp") or 0) - int(_utcnow().timestamp()))
        return _session_payload(
            user,
            access_token=access_token or "",
            refresh_token=refresh_token,
            expires_in=remaining,
        )

    await delete_refresh_token(user_id, token_id)
    access = create_access_token(user_id, user["role"], user["email"])
    new_refresh, _ = await create_refresh_token_value(user_id, user["role"])
    return _session_payload(
        user,
        access_token=access,
        refresh_token=new_refresh,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


async def logout_session(*, refresh_token: Optional[str] = None, access_token: Optional[str] = None) -> dict[str, Any]:
    """Revoke refresh tokens for this session. Always succeeds so logout can fire in the background."""
    user_id: Optional[str] = None
    refresh_payload = try_decode_token(refresh_token, TOKEN_TYPE_REFRESH)
    if refresh_payload:
        user_id = str(refresh_payload.get("sub") or "") or None
    if not user_id:
        access_payload = try_decode_token(access_token, TOKEN_TYPE_ACCESS)
        if access_payload:
            user_id = str(access_payload.get("sub") or "") or None
    if user_id:
        deleted = await delete_all_refresh_tokens(user_id)
        logger.info("Logged out user_id=%s revoked=%s", user_id, deleted)
    return {"logged_out": True}


async def get_profile(
    user_id: str,
    requester_id: str,
    requester_role: str,
    endpoint: str = "GET /api/auth/profile",
) -> dict[str, Any]:
    if not can_view_profile(requester_role, requester_id, user_id):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Role '{requester_role}' cannot view this profile. "
            f"Allowed roles for this endpoint: "
            f"{ENDPOINT_ACCESS.get(endpoint, {}).get('allowed_roles', [])}",
        )

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    profile = filter_profile_for_view(public_profile(user), user.get("role", UserRole.STUDENT.value))
    return {
        "profile": profile,
        "access": build_access_info(requester_role, requester_id, user_id, endpoint),
    }


async def edit_profile(
    user_id: str,
    requester_id: str,
    requester_role: str,
    updates: dict[str, Any],
    endpoint: str = "PUT /api/auth/profile",
) -> dict[str, Any]:
    if not can_edit_profile(requester_role, requester_id, user_id):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Role '{requester_role}' cannot edit this profile. "
            f"Allowed roles for this endpoint: "
            f"{ENDPOINT_ACCESS.get(endpoint, {}).get('allowed_roles', [])}",
        )

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    allowed = editable_fields_for(requester_role, user_id, requester_id)
    disallowed = [key for key in updates if key not in allowed and updates[key] is not None]
    if disallowed:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Role '{requester_role}' cannot update fields: {', '.join(disallowed)}. "
            f"Allowed fields: {', '.join(sorted(allowed))}",
        )

    fields: dict[str, Any] = {}
    for key, value in updates.items():
        if key not in allowed or value is None:
            continue
        if key == "address" and isinstance(value, Address):
            fields[key] = value.model_dump(exclude_none=True)
        elif key == "address" and isinstance(value, dict):
            fields[key] = Address(**value).model_dump(exclude_none=True)
        elif key == "role" and isinstance(value, UserRole):
            fields[key] = value.value
        else:
            fields[key] = value

    updated = await update_user_fields(user_id, fields)
    profile = filter_profile_for_view(
        public_profile(updated),
        updated.get("role", UserRole.STUDENT.value),
    )
    logger.info("Profile updated for user_id=%s by requester=%s", user_id, requester_id)
    return {
        "profile": profile,
        "access": build_access_info(requester_role, requester_id, user_id, endpoint),
    }


def get_profile_access_matrix(requester_role: str) -> dict[str, Any]:
    """Return which profile endpoints the requester's role may use."""
    endpoints: dict[str, Any] = {}
    for path, meta in ENDPOINT_ACCESS.items():
        allowed = requester_role in meta["allowed_roles"]
        endpoints[path] = {
            "description": meta["description"],
            "allowed": allowed,
            "allowed_roles": meta["allowed_roles"],
        }
    return {
        "requester_role": requester_role,
        "endpoints": endpoints,
    }


def prepare_profile_pic_upload(user_id: str, filename: str) -> tuple[str, str]:
    """Build the S3 object key and public URL for a profile picture upload."""
    key = s3bucket.build_key(f"profiles/{user_id}/avatar", filename or "avatar.jpg")
    return key, s3bucket.public_url(key)


def validate_profile_pic_file(content_type: str, data: bytes) -> None:
    """Validate uploaded profile picture size and content type."""
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Profile picture file is empty")
    if len(data) > MAX_PROFILE_PIC_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Profile picture must be 5 MB or smaller",
        )
    if content_type not in ALLOWED_PROFILE_PIC_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Profile picture must be JPEG, PNG, WebP, or GIF",
        )


async def upload_profile_pic_background(key: str, data: bytes, content_type: str) -> None:
    """Upload a profile picture to S3. Intended for FastAPI BackgroundTasks."""
    try:
        await s3bucket.upload_image_async(key=key, data=data, content_type=content_type)
    except Exception:
        logger.exception("Failed to upload profile picture to S3: %s", key)
