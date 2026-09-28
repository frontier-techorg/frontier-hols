"""Create a fresh admin/affiliate/student set and check write-time money counters."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Optional

BASE = "http://127.0.0.1:8000"
PASSWORD = "DevTest123!"
ADMIN_EMAIL = "hols.dev.admin@houseoflifesciences.com"
AFF_EMAIL = "hols.dev.aff@houseoflifesciences.com"
STUDENT_EMAIL = "hols.dev.student@houseoflifesciences.com"


def _request(
    method: str,
    path: str,
    *,
    body: Optional[dict[str, Any]] = None,
    token: Optional[str] = None,
) -> Any:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"{method} {path} -> {exc.code} {detail}") from exc
    if not payload.get("status"):
        raise RuntimeError(f"{method} {path} failed: {payload}")
    return payload.get("response")


def _money(value: Any) -> float:
    return round(float(value or 0), 2)


def _eq(label: str, actual: Any, expected: Any) -> None:
    left = _money(actual) if isinstance(expected, float) else actual
    right = expected
    if left != right:
        raise AssertionError(f"{label}: got {left!r} expected {right!r}")
    print(f"  ok {label}={left}")


def login(email: str, role: str) -> str:
    result = _request("POST", "/api/auth/login", body={"email": email, "password": PASSWORD, "role": role})
    token = result.get("access_token")
    if not token:
        raise RuntimeError(f"login missing token for {email}: {result}")
    return token


def main() -> int:
    health = _request("GET", "/api/health")
    print("health", health)

    admin = _request(
        "POST",
        "/api/auth/create-admin",
        body={
            "email": ADMIN_EMAIL,
            "password": PASSWORD,
            "first_name": "Dev",
            "last_name": "Admin",
        },
    )
    print("admin", admin["user_id"])
    admin_token = login(ADMIN_EMAIL, "admin")

    affiliate = _request(
        "POST",
        "/api/admin/affiliates",
        token=admin_token,
        body={
            "email": AFF_EMAIL,
            "password": PASSWORD,
            "first_name": "Dev",
            "last_name": "Affiliate",
            "margin_percent": 20,
        },
    )
    affiliate_id = affiliate["user_id"]
    print("affiliate", affiliate_id, "invite", affiliate.get("profile", {}).get("invite_code"))

    student = _request(
        "POST",
        "/api/auth/signup",
        body={
            "email": STUDENT_EMAIL,
            "password": PASSWORD,
            "first_name": "Dev",
            "last_name": "Student",
            "referred_by_affiliate_id": affiliate_id,
        },
    )
    student_id = student["user_id"]
    print("student", student_id)
    student_token = login(STUDENT_EMAIL, "student")
    affiliate_token = login(AFF_EMAIL, "affiliate")

    purchase = _request("POST", "/api/payment/purchase", token=student_token, body={"plan_type": "monthly"})
    amount = _money(purchase["order"]["amount"])
    print("purchased", purchase["order"]["order_id"], amount)

    commerce = _request("GET", "/api/payment/commerce", token=student_token)
    _eq("student.total_spent", commerce["total_spent"], amount)
    _eq("student.order_count", commerce["order_count"], 1)

    sales = _request("GET", "/api/payment/sales", token=admin_token)
    finance = sales["finance"]
    dashboard = _request("GET", "/api/affiliate/dashboard?period=weekly", token=affiliate_token)
    wallet = dashboard["wallet"]
    commission = _money(wallet["total_earned"])
    profit = _money(amount - commission)
    print("commission", commission, "profit", profit, "lock_seconds", dashboard.get("payout_lock_seconds"))
    _eq("admin.revenue", finance["revenue"], amount)
    _eq("admin.profit", finance["profit"], profit)
    _eq("admin.affiliate_earned", finance["affiliate_earned"], commission)
    _eq("admin.affiliate_lock", finance["affiliate_lock"], commission)
    _eq("admin.affiliate_available", finance["affiliate_available"], 0.0)
    _eq("admin.affiliate_pending", finance["affiliate_pending"], 0.0)
    _eq("admin.affiliate_paid_out", finance["affiliate_paid_out"], 0.0)
    _eq("affiliate.earning", wallet["total_earned"], commission)
    _eq("affiliate.lock", wallet["lock_amount"], commission)
    _eq("affiliate.available", wallet["available"], 0.0)
    _eq("affiliate.pending", wallet["pending"], 0.0)
    _eq("affiliate.payout", wallet["paid_out"], 0.0)
    _eq("affiliate.students", dashboard["student_count"], 1)
    _eq("affiliate.orders", wallet["order_count"], 1)

    students = _request("GET", "/api/users/students?page=1&limit=20", token=admin_token)
    student_row = next(item for item in students["items"] if item["user_id"] == student_id)
    _eq("admin student list total_spent", student_row["total_spent"], amount)
    _eq("admin student list order_count", student_row["order_count"], 1)

    print("waiting for 1-minute lock release...")
    unlocked = False
    for _ in range(16):
        time.sleep(8)
        dashboard = _request("GET", "/api/affiliate/dashboard?period=weekly", token=affiliate_token)
        wallet = dashboard["wallet"]
        if _money(wallet["lock_amount"]) == 0 and _money(wallet["available"]) == commission:
            unlocked = True
            break
        print("  lock still", wallet["lock_amount"], "available", wallet["available"])
    if not unlocked:
        raise AssertionError(f"lock did not release: {wallet}")
    sales = _request("GET", "/api/payment/sales", token=admin_token)
    finance = sales["finance"]
    _eq("after unlock lock", wallet["lock_amount"], 0.0)
    _eq("after unlock available", wallet["available"], commission)
    _eq("admin lock after unlock", finance["affiliate_lock"], 0.0)
    _eq("admin available after unlock", finance["affiliate_available"], commission)

    requested = _request("POST", "/api/affiliate/payouts", token=affiliate_token, body={})
    payout_id = requested["payout"]["payout_id"]
    wallet = requested["wallet"]
    _eq("request pending", wallet["pending"], commission)
    _eq("request available", wallet["available"], 0.0)
    sales = _request("GET", "/api/payment/sales", token=admin_token)
    finance = sales["finance"]
    _eq("admin pending after request", finance["affiliate_pending"], commission)
    _eq("admin available after request", finance["affiliate_available"], 0.0)

    _request("POST", f"/api/admin/affiliates/payouts/{payout_id}/reject", token=admin_token, body={})
    overview = _request("GET", "/api/affiliate/payouts", token=affiliate_token)
    wallet = overview["wallet"]
    _eq("reject pending", wallet["pending"], 0.0)
    _eq("reject available", wallet["available"], commission)
    sales = _request("GET", "/api/payment/sales", token=admin_token)
    finance = sales["finance"]
    _eq("admin pending after reject", finance["affiliate_pending"], 0.0)
    _eq("admin available after reject", finance["affiliate_available"], commission)

    requested = _request("POST", "/api/affiliate/payouts", token=affiliate_token, body={})
    payout_id = requested["payout"]["payout_id"]
    _request("POST", f"/api/admin/affiliates/payouts/{payout_id}/accept", token=admin_token, body={})
    overview = _request("GET", "/api/affiliate/payouts", token=affiliate_token)
    wallet = overview["wallet"]
    _eq("accept pending", wallet["pending"], 0.0)
    _eq("accept payout", wallet["paid_out"], commission)
    _eq("accept available", wallet["available"], 0.0)
    sales = _request("GET", "/api/payment/sales", token=admin_token)
    finance = sales["finance"]
    _eq("admin pending after accept", finance["affiliate_pending"], 0.0)
    _eq("admin payout after accept", finance["affiliate_paid_out"], commission)
    _eq("admin available after accept", finance["affiliate_available"], 0.0)

    print("ALL CHECKS PASSED")
    print(
        json.dumps(
            {
                "admin_email": ADMIN_EMAIL,
                "affiliate_email": AFF_EMAIL,
                "student_email": STUDENT_EMAIL,
                "password": PASSWORD,
                "affiliate_id": affiliate_id,
                "invite_code": affiliate.get("profile", {}).get("invite_code"),
                "amount": amount,
                "commission": commission,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
