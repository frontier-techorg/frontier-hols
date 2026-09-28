import type { SidebarIconName } from "@/components/platform/provider/sidebar-icons";
import type { Membership, Plan, PlanType } from "@/lib/integrate/provider/student/payment/types";

export const PLAN_ORDER: PlanType[] = ["monthly", "biannual", "annual"];

export type PlanMeta = {
  period: string;
  badge?: string;
  favourite?: boolean;
  features: string[];
  icon: SidebarIconName;
};

export const PLAN_META: Record<PlanType, PlanMeta> = {
  monthly: {
    period: "per month",
    badge: "Flexible",
    features: ["Lecture library", "Calculator tools", "AI adviser"],
    icon: "clock",
  },
  biannual: {
    period: "every 6 months",
    badge: "Most chosen",
    favourite: true,
    features: ["Everything in Monthly", "Priority updates", "6 months access"],
    icon: "star",
  },
  annual: {
    period: "per year",
    badge: "Best value",
    features: ["Everything in Biannual", "Year-round access", "Certification support"],
    icon: "plans",
  },
};

export function sortedPlans(plans: Plan[]) {
  return [...plans].sort(
    (a, b) => PLAN_ORDER.indexOf(a.plan_type) - PLAN_ORDER.indexOf(b.plan_type),
  );
}

export function membershipProgress(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.min(1, Math.max(0, (Date.now() - from) / (to - from)));
}

export function daysUntil(iso?: string | null) {
  if (!iso) return null;
  const to = new Date(iso).getTime();
  if (!Number.isFinite(to)) return null;
  return Math.max(0, Math.ceil((to - Date.now()) / 86_400_000));
}

export function isCurrentPlan(plan: Plan, membership: Membership | null) {
  return membership?.plan_type === plan.plan_type;
}

export function monthlyEquivalent(plan: Plan) {
  const months = plan.plan_type === "annual" ? 12 : plan.plan_type === "biannual" ? 6 : 1;
  if (months <= 1 || plan.price <= 0) return null;
  return plan.price / months;
}

export function savingsVersusMonthly(plan: Plan, monthly?: Plan | null) {
  if (!monthly || plan.plan_type === "monthly" || monthly.price <= 0) return null;
  const months = plan.plan_type === "annual" ? 12 : 6;
  const compared = monthly.price * months;
  const saved = compared - plan.price;
  if (saved <= 0) return null;
  return {
    amount: saved,
    percent: Math.round((saved / compared) * 100),
  };
}
