"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { MembershipHubSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { MembershipListPanel } from "@/components/platform/provider/student/payment/MembershipListPanel";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getCachedCurrentMembership,
  getCachedPlans,
  getCurrentMembership,
  listPlans,
  type Membership,
  type Plan,
  type PlanType,
} from "@/lib/integrate/provider/student/payment/api";
import { isActiveMembership } from "@/lib/integrate/provider/student/payment/membershipAccess";
import { formatDate, planLabels } from "@/lib/integrate/provider/student/payment/types";

export function StudentPlansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromLectures = searchParams.get("from") === "lectures";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const [membershipRes, plansRes] = await Promise.all([
        getCurrentMembership(signal),
        listPlans(signal),
      ]);

      if (signal?.aborted) return;
      setMembership(membershipRes.membership);
      setPlans(plansRes.items);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof ApiRequestError ? err.message : "Failed to load plans.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const cachedMembership = getCachedCurrentMembership();
    const cachedPlans = getCachedPlans();
    const hasCachedPageData = cachedMembership !== undefined && cachedPlans !== undefined;

    if (hasCachedPageData) {
      setMembership(cachedMembership ?? null);
      setPlans(cachedPlans ?? []);
      setLoading(false);
    }

    const timer = window.setTimeout(() => void loadData(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadData]);

  function openCheckout(planType: PlanType) {
    router.push(`/student/plans/checkout?plan=${planType}`);
  }

  const subscribed = isActiveMembership(membership);
  const planMessage = subscribed
    ? {
        title: planLabels[membership!.plan_type],
        statusMeta: `Active · ends ${formatDate(membership!.end_date)}`,
        description: "Your lectures, lessons, and quizzes stay available through this term. Switch plans below anytime.",
      }
    : {
        title: "Choose a membership",
        statusMeta: undefined,
        description: fromLectures
          ? "An active membership unlocks the course library, lessons, and quizzes. Select a plan to continue."
          : "Unlock the course library, lessons, and quizzes. Access begins as soon as your membership is active.",
      };

  return (
    <div className="grid w-full min-w-0 gap-3 sm:gap-4">
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

      {error && !loading && plans.length === 0 ? null : loading ? (
        <MembershipHubSkeleton />
      ) : (
        <MembershipListPanel
          plans={plans}
          membership={membership}
          activePlanType={null}
          onSelect={openCheckout}
          statusTitle={planMessage.title}
          statusMeta={planMessage.statusMeta}
          statusDescription={planMessage.description}
        />
      )}
    </div>
  );
}

/** @deprecated Use StudentPlansPage */
export const StudentPaymentPage = StudentPlansPage;
