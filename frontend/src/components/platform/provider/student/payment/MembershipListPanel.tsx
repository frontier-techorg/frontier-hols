"use client";

import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { Button } from "@/components/ui/Button";
import {
  PLAN_META,
  daysUntil,
  isCurrentPlan,
  monthlyEquivalent,
  savingsVersusMonthly,
  sortedPlans,
} from "@/components/platform/provider/student/payment/membershipPlans";
import type { Membership, Plan, PlanType } from "@/lib/integrate/provider/student/payment/types";
import { formatDate, formatMoney, planLabels } from "@/lib/integrate/provider/student/payment/types";
import { cn } from "@/lib/utils";

type MembershipListPanelProps = {
  plans: Plan[];
  membership: Membership | null;
  activePlanType: PlanType | null;
  onSelect: (planType: PlanType) => void;
  statusTitle?: string;
  statusMeta?: string;
  statusDescription?: string;
  ctaLabel?: string;
};

export function MembershipListPanel({
  plans,
  membership,
  activePlanType,
  onSelect,
  statusTitle,
  statusMeta,
  statusDescription,
  ctaLabel,
}: MembershipListPanelProps) {
  const ordered = sortedPlans(plans);
  const monthly = ordered.find((plan) => plan.plan_type === "monthly") ?? null;

  return (
    <div className="grid min-w-0 gap-3 sm:gap-4">
      <MembershipStatusBar
        membership={membership}
        statusTitle={statusTitle}
        statusMeta={statusMeta}
        statusDescription={statusDescription}
      />

      {ordered.length === 0 ? (
        <section className="dashboard-glass-card flex flex-col items-center rounded-2xl px-4 py-12 text-center sm:px-5 sm:py-14">
          <span className="dashboard-tool-icon flex h-14 w-14 items-center justify-center rounded-full">
            <SidebarSvgIcon name="plans" size={22} strokeWidth={1.85} />
          </span>
          <p className="font-sans mt-4 text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
            No membership plans yet
          </p>
          <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
            Plans will show up here when they are published for enrollment.
          </p>
        </section>
      ) : (
        <div className="@container min-w-0">
        <div className="grid grid-cols-1 gap-3 @min-[36rem]:grid-cols-2 @min-[36rem]:gap-4 @min-[56rem]:grid-cols-3">
          {ordered.map((plan) => (
            <PlanCard
              key={plan.plan_type}
              plan={plan}
              membership={membership}
              monthly={monthly}
              selected={activePlanType === plan.plan_type}
              onSelect={onSelect}
              ctaLabel={ctaLabel}
            />
          ))}
        </div>
        </div>
      )}
    </div>
  );
}

function MembershipStatusBar({
  membership,
  statusTitle,
  statusMeta,
  statusDescription,
}: {
  membership: Membership | null;
  statusTitle?: string;
  statusMeta?: string;
  statusDescription?: string;
}) {
  const remaining = daysUntil(membership?.end_date);
  const title =
    statusTitle ??
    (membership
      ? planLabels[membership.plan_type]
      : "Choose a membership");
  const meta =
    statusMeta ??
    (membership
      ? remaining == null
        ? `Active · ends ${formatDate(membership.end_date)}`
        : remaining === 0
          ? "Ended"
          : `Active · ${remaining} days left`
      : undefined);
  const description =
    statusDescription ??
    (membership
      ? "Your lectures, lessons, and quizzes stay available through this term. Switch plans below anytime."
      : "Unlock the course library, lessons, and quizzes. Access begins as soon as your membership is active.");

  return (
    <section className="dashboard-glass-card flex min-w-0 items-start gap-3 rounded-2xl px-4 py-4 sm:gap-4 sm:px-5 sm:py-5">
      <span className="dashboard-tool-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
        <SidebarSvgIcon name="plans" size={18} strokeWidth={1.85} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <p className="font-sans min-w-0 break-words text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
            {title}
          </p>
          {meta ? (
            <span className="text-brand-caption inline-flex rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 font-semibold text-[color:var(--dash-text)]">
              {meta}
            </span>
          ) : null}
        </div>
        <p className="text-brand-body mt-1 text-sm leading-6 text-[color:var(--dash-muted)]">
          {description}
        </p>
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  membership,
  monthly,
  selected,
  onSelect,
  ctaLabel,
}: {
  plan: Plan;
  membership: Membership | null;
  monthly: Plan | null;
  selected: boolean;
  onSelect: (planType: PlanType) => void;
  ctaLabel?: string;
}) {
  const meta = PLAN_META[plan.plan_type];
  const current = !ctaLabel && isCurrentPlan(plan, membership);
  const featured = Boolean(meta.favourite) && !current;
  const savings = savingsVersusMonthly(plan, monthly);
  const perMonth = monthlyEquivalent(plan);
  const priceLabel = formatMoney(plan.price, plan.currency || "USD");
  const badge = current ? "Yours" : meta.badge;

  return (
    <article
      onClick={() => {
        if (!current) onSelect(plan.plan_type);
      }}
      className={cn(
        "dashboard-glass-card membership-plan-card relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl p-4 sm:p-5",
        featured && "membership-plan-card--favourite",
        current && "membership-plan-card--current",
        selected && "ring-2 ring-[color:var(--dash-navy)]/25",
        !current && "cursor-pointer",
      )}
    >
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span
          className={cn(
            "membership-plan-badge",
            current
              ? "membership-plan-badge--current"
              : featured
                ? "membership-plan-badge--favourite"
                : "membership-plan-badge--value",
          )}
        >
          {badge ?? "Plan"}
        </span>
        {savings ? (
          <span className="text-brand-caption font-semibold text-[color:var(--dash-amount)]">
            Save {savings.percent}%
          </span>
        ) : null}
      </div>

      <h3 className="font-sans mt-3 text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)]">
        {planLabels[plan.plan_type]}
      </h3>

      <p className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
        <span className="font-sans min-w-0 break-words text-[1.65rem] font-bold leading-none tracking-[0.01em] tabular-nums text-[color:var(--dash-text)] sm:text-[2rem]">
          {priceLabel}
        </span>
        <span className="text-brand-caption pb-0.5 font-medium text-[color:var(--dash-faint)]">
          {perMonth ? `${formatMoney(perMonth, plan.currency || "USD")}/mo` : meta.period}
        </span>
      </p>

      <ul className="mt-5 flex flex-1 flex-col gap-2.5">
        {meta.features.map((feature) => (
          <li key={feature} className="flex min-w-0 items-start gap-2.5">
            <span className="membership-plan-check mt-0.5" aria-hidden>
              <SidebarSvgIcon name="check" size={11} strokeWidth={2.6} />
            </span>
            <span className="min-w-0 break-words text-sm leading-5 text-[color:var(--dash-muted)]">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {current ? (
          <span className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white opacity-70">
            Current plan
          </span>
        ) : (
          <Button
            type="button"
            className="lecture-page-action w-full"
            onClick={() => onSelect(plan.plan_type)}
          >
            {ctaLabel ?? (membership ? "Switch" : "Get this plan")}
          </Button>
        )}
      </div>
    </article>
  );
}
