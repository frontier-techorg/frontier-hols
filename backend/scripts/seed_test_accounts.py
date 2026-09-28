"""Create the requested admin plus several affiliates/students and check money flows."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Optional

BASE = "http://127.0.0.1:8000"
ADMIN_EMAIL = "hasnainnaseer987@gmail.com"
ADMIN_PASSWORD = "12345678"
PASSWORD = "12345678"


def _request(
    method: str,
    path: str,
    *,
    body: Optional[dict[str, Any]] = None,
    token: Optional[str] = None,
    ok_statuses: tuple[int, ...] = (200, 201),
) -> Any:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            payload = json.loads(response.read().decode())
            status = response.status
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        if exc.code not in ok_statuses:
            raise RuntimeError(f"{method} {path} -> {exc.code} {detail}") from exc
        try:
            payload = json.loads(detail)
        except json.JSONDecodeError as parse_exc:
            raise RuntimeError(f"{method} {path} -> {exc.code} {detail}") from parse_exc
        status = exc.code
    if status in ok_statuses and payload.get("status") is False:
        raise RuntimeError(f"{method} {path} failed: {payload}")
    return payload.get("response") if isinstance(payload, dict) else payload


def _money(value: Any) -> float:
    return round(float(value or 0), 2)


def _eq(label: str, actual: Any, expected: Any) -> None:
    left = _money(actual) if isinstance(expected, float) else actual
    if left != expected:
        raise AssertionError(f"{label}: got {left!r} expected {expected!r}")
    print(f"  ok {label}={left}")


def login(email: str, role: str, password: str = PASSWORD) -> str:
    result = _request(
        "POST",
        "/api/auth/login",
        body={"email": email, "password": password, "role": role},
    )
    token = result.get("access_token")
    if not token:
        raise RuntimeError(f"login missing token for {email}: {result}")
    return token


def purchase(token: str, plan_type: str) -> dict[str, Any]:
    return _request("POST", "/api/payment/purchase", token=token, body={"plan_type": plan_type})


def ensure_admin() -> str:
    try:
        created = _request(
            "POST",
            "/api/auth/create-admin",
            body={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD,
                "first_name": "Hasnain",
                "last_name": "Naseer",
            },
        )
        print("created admin", created["user_id"])
        return created["user_id"]
    except RuntimeError as exc:
        if "409" not in str(exc) and "already registered" not in str(exc).lower():
            raise
        print("admin email already exists; resetting password")
        return reset_admin_password()


def reset_admin_password() -> str:
    import asyncio

    from services.routes.auth import service as auth_service
    from database_entities import UserRole

    async def _reset() -> str:
        user = await auth_service.get_user_by_email(ADMIN_EMAIL)
        if not user:
            raise RuntimeError("admin email conflict but user was not found")
        if user.get("role") != UserRole.ADMIN.value:
            raise RuntimeError(f"{ADMIN_EMAIL} exists as {user.get('role')}, not admin")
        await auth_service.update_user_fields(
            user["user_id"],
            {"password_hash": auth_service.hash_password(ADMIN_PASSWORD)},
        )
        return str(user["user_id"])

    return asyncio.run(_reset())


def create_affiliate(admin_token: str, *, email: str, first: str, last: str, margin: float) -> dict[str, Any]:
    result = _request(
        "POST",
        "/api/admin/affiliates",
        token=admin_token,
        body={
            "email": email,
            "password": PASSWORD,
            "first_name": first,
            "last_name": last,
            "margin_percent": margin,
        },
    )
    return {
        "user_id": result["user_id"],
        "email": email,
        "invite_code": result.get("profile", {}).get("invite_code"),
        "margin": margin,
        "first": first,
        "last": last,
    }


def create_student(*, email: str, first: str, last: str, affiliate_id: Optional[str] = None) -> dict[str, Any]:
    body: dict[str, Any] = {
        "email": email,
        "password": PASSWORD,
        "first_name": first,
        "last_name": last,
    }
    if affiliate_id:
        body["referred_by_affiliate_id"] = affiliate_id
    result = _request("POST", "/api/auth/signup", body=body)
    return {"user_id": result["user_id"], "email": email, "affiliate_id": affiliate_id, "first": first, "last": last}


def wait_unlock(token: str, expected_available: float) -> dict[str, Any]:
    print(f"waiting for lock release to available={expected_available}...")
    wallet = None
    for _ in range(16):
        time.sleep(8)
        dashboard = _request("GET", "/api/affiliate/dashboard?period=weekly", token=token)
        wallet = dashboard["wallet"]
        if _money(wallet["lock_amount"]) == 0 and _money(wallet["available"]) == expected_available:
            return wallet
        print("  lock", wallet["lock_amount"], "available", wallet["available"], "pending", wallet.get("pending"))
    raise AssertionError(f"lock did not release: {wallet}")


def main() -> int:
    admin_id = ensure_admin()
    admin_token = login(ADMIN_EMAIL, "admin", ADMIN_PASSWORD)
    print("admin login ok", admin_id)

    before_sales = _request("GET", "/api/payment/sales", token=admin_token)
    before = before_sales["finance"]
    print("finance before", before)

    affiliates = [
        create_affiliate(admin_token, email="aff.alpha.test@houseoflifesciences.com", first="Alpha", last="Affiliate", margin=20),
        create_affiliate(admin_token, email="aff.beta.test@houseoflifesciences.com", first="Beta", last="Affiliate", margin=15),
        create_affiliate(admin_token, email="aff.gamma.test@houseoflifesciences.com", first="Gamma", last="Affiliate", margin=10),
    ]
    for row in affiliates:
        print("affiliate", row["first"], row["user_id"], "margin", row["margin"], "invite", row["invite_code"])

    students = [
        create_student(email="stu.alpha1.test@houseoflifesciences.com", first="Amina", last="Khan", affiliate_id=affiliates[0]["user_id"]),
        create_student(email="stu.alpha2.test@houseoflifesciences.com", first="Omar", last="Riaz", affiliate_id=affiliates[0]["user_id"]),
        create_student(email="stu.beta1.test@houseoflifesciences.com", first="Sara", last="Malik", affiliate_id=affiliates[1]["user_id"]),
        create_student(email="stu.beta2.test@houseoflifesciences.com", first="Hassan", last="Ali", affiliate_id=affiliates[1]["user_id"]),
        create_student(email="stu.gamma1.test@houseoflifesciences.com", first="Noor", last="Ahmed", affiliate_id=affiliates[2]["user_id"]),
        create_student(email="stu.direct1.test@houseoflifesciences.com", first="Direct", last="Buyer"),
        create_student(email="stu.direct2.test@houseoflifesciences.com", first="Direct", last="Idle"),
    ]
    for row in students:
        print("student", row["first"], row["last"], row["user_id"], "aff", row["affiliate_id"] or "none")

    time.sleep(1)
    listed_aff = _request("GET", "/api/users/affiliates?page=1&limit=50", token=admin_token)
    listed_stu = _request("GET", "/api/users/students?page=1&limit=50", token=admin_token)
    aff_emails = {item["email"] for item in listed_aff["items"]}
    stu_emails = {item["email"] for item in listed_stu["items"]}
    for row in affiliates:
        if row["email"] not in aff_emails:
            raise AssertionError(f"affiliate {row['email']} missing from admin list")
    for row in students:
        if row["email"] not in stu_emails:
            raise AssertionError(f"student {row['email']} missing from admin list")
    print("  ok admin lists include all new accounts", "affiliates", listed_aff["pagination"]["total"], "students", listed_stu["pagination"]["total"])

    purchases = [
        (students[0], "monthly"),
        (students[1], "annual"),
        (students[2], "biannual"),
        (students[5], "monthly"),
    ]
    expected_revenue = 0.0
    expected_commission = 0.0
    affiliate_commission = {row["user_id"]: 0.0 for row in affiliates}
    affiliate_orders = {row["user_id"]: 0 for row in affiliates}

    for student, plan_type in purchases:
        token = login(student["email"], "student")
        result = purchase(token, plan_type)
        amount = _money(result["order"]["amount"])
        expected_revenue += amount
        commerce = _request("GET", "/api/payment/commerce", token=token)
        _eq(f"{student['email']} sales", commerce["total_spent"], amount)
        _eq(f"{student['email']} orders", commerce["order_count"], 1)
        if student["affiliate_id"]:
            affiliate = next(item for item in affiliates if item["user_id"] == student["affiliate_id"])
            commission = round(amount * affiliate["margin"] / 100, 2)
            expected_commission += commission
            affiliate_commission[affiliate["user_id"]] += commission
            affiliate_orders[affiliate["user_id"]] += 1
        print("purchased", plan_type, amount, "student", student["email"])

    expected_profit = round(expected_revenue - expected_commission, 2)
    expected_commission = round(expected_commission, 2)

    after_sales = _request("GET", "/api/payment/sales", token=admin_token)
    after = after_sales["finance"]
    _eq("admin revenue delta", round(_money(after["revenue"]) - _money(before["revenue"]), 2), expected_revenue)
    _eq("admin profit delta", round(_money(after["profit"]) - _money(before["profit"]), 2), expected_profit)
    _eq("admin earning delta", round(_money(after["affiliate_earned"]) - _money(before["affiliate_earned"]), 2), expected_commission)
    _eq("admin lock delta", round(_money(after["affiliate_lock"]) - _money(before["affiliate_lock"]), 2), expected_commission)

    idle = login(students[3]["email"], "student")
    idle_commerce = _request("GET", "/api/payment/commerce", token=idle)
    _eq("idle student sales", idle_commerce["total_spent"], 0.0)
    _eq("idle student orders", idle_commerce["order_count"], 0)

    alpha_token = login(affiliates[0]["email"], "affiliate")
    beta_token = login(affiliates[1]["email"], "affiliate")
    gamma_token = login(affiliates[2]["email"], "affiliate")
    alpha_dash = _request("GET", "/api/affiliate/dashboard?period=weekly", token=alpha_token)
    beta_dash = _request("GET", "/api/affiliate/dashboard?period=weekly", token=beta_token)
    gamma_dash = _request("GET", "/api/affiliate/dashboard?period=weekly", token=gamma_token)
    _eq("alpha students", alpha_dash["student_count"], 2)
    _eq("alpha orders", alpha_dash["wallet"]["order_count"], affiliate_orders[affiliates[0]["user_id"]])
    _eq("alpha earning", alpha_dash["wallet"]["total_earned"], round(affiliate_commission[affiliates[0]["user_id"]], 2))
    _eq("alpha lock", alpha_dash["wallet"]["lock_amount"], round(affiliate_commission[affiliates[0]["user_id"]], 2))
    _eq("beta students", beta_dash["student_count"], 2)
    _eq("beta orders", beta_dash["wallet"]["order_count"], 1)
    _eq("beta earning", beta_dash["wallet"]["total_earned"], round(affiliate_commission[affiliates[1]["user_id"]], 2))
    _eq("gamma students", gamma_dash["student_count"], 1)
    _eq("gamma orders", gamma_dash["wallet"]["order_count"], 0)
    _eq("gamma earning", gamma_dash["wallet"]["total_earned"], 0.0)

    alpha_available = round(affiliate_commission[affiliates[0]["user_id"]], 2)
    beta_available = round(affiliate_commission[affiliates[1]["user_id"]], 2)
    wait_unlock(alpha_token, alpha_available)
    beta_wallet = wait_unlock(beta_token, beta_available)

    requested = _request("POST", "/api/affiliate/payouts", token=alpha_token, body={})
    alpha_payout_id = requested["payout"]["payout_id"]
    _eq("alpha pending after request", requested["wallet"]["pending"], alpha_available)
    _request("POST", f"/api/admin/affiliates/payouts/{alpha_payout_id}/accept", token=admin_token, body={})
    alpha_overview = _request("GET", "/api/affiliate/payouts", token=alpha_token)
    _eq("alpha paid out", alpha_overview["wallet"]["paid_out"], alpha_available)
    _eq("alpha pending after accept", alpha_overview["wallet"]["pending"], 0.0)

    requested = _request("POST", "/api/affiliate/payouts", token=beta_token, body={})
    beta_payout_id = requested["payout"]["payout_id"]
    _request("POST", f"/api/admin/affiliates/payouts/{beta_payout_id}/reject", token=admin_token, body={})
    beta_overview = _request("GET", "/api/affiliate/payouts", token=beta_token)
    _eq("beta pending after reject", beta_overview["wallet"]["pending"], 0.0)
    _eq("beta available after reject", beta_overview["wallet"]["available"], beta_available)

    final_sales = _request("GET", "/api/payment/sales", token=admin_token)
    final = final_sales["finance"]
    _eq("admin payout includes alpha", round(_money(final["affiliate_paid_out"]) - _money(before["affiliate_paid_out"]), 2), alpha_available)
    _eq("admin pending after reviews", _money(final["affiliate_pending"]), _money(before["affiliate_pending"]))
    _eq("admin available includes beta", round(_money(final["affiliate_available"]) - _money(before["affiliate_available"]), 2), beta_available)
    _eq("admin lock after unlock", _money(final["affiliate_lock"]), _money(before["affiliate_lock"]))

    print("ALL CHECKS PASSED")
    print(json.dumps({
        "admin": {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        "password_for_new_accounts": PASSWORD,
        "affiliates": affiliates,
        "students": [
            {**row, "purchased": next((plan for student, plan in purchases if student["email"] == row["email"]), None)}
            for row in students
        ],
        "new_revenue": expected_revenue,
        "new_commission": expected_commission,
        "new_profit": expected_profit,
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
