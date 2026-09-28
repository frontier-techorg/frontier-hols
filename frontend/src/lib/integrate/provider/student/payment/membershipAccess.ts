"use client";

import { useEffect, useState } from "react";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getCachedCurrentMembership,
  getCurrentMembership,
} from "@/lib/integrate/provider/student/payment/api";
import type { Membership } from "@/lib/integrate/provider/student/payment/types";

export const MEMBERSHIP_REQUIRED_CODE = "MEMBERSHIP_REQUIRED";
export const MEMBERSHIP_PLANS_HREF = "/student/plans";

export function isActiveMembership(membership: Membership | null | undefined): boolean {
  if (!membership) return false;
  if (membership.status.trim().toLowerCase() !== "active") return false;
  const end = Date.parse(membership.end_date);
  return Number.isFinite(end) && end > Date.now();
}

export function isMembershipRequiredError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.errorCode === MEMBERSHIP_REQUIRED_CODE;
}

export function useStudentMembershipAccess() {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cached = getCachedCurrentMembership();
    if (cached !== undefined) {
      setMembership(cached);
      setReady(true);
    }

    let cancelled = false;
    void getCurrentMembership()
      .then((result) => {
        if (!cancelled) setMembership(result.membership);
      })
      .catch(() => {
        if (!cancelled && cached === undefined) setMembership(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const unlocked = isActiveMembership(membership);
  return {
    membership,
    ready,
    unlocked,
    locked: ready && !unlocked,
  };
}
