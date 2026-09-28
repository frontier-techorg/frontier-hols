"use client";

import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { Button } from "@/components/ui/Button";
import { PLAN_META } from "@/components/platform/provider/student/payment/membershipPlans";
import type { Membership, Plan } from "@/lib/integrate/provider/student/payment/types";
import { formatDate, formatMoney, planLabels } from "@/lib/integrate/provider/student/payment/types";

type MembershipPlanPanelProps = {
  plan: Plan;
  membership: Membership | null;
  purchasing?: boolean;
  gatewayBypassed?: boolean;
  error?: string | null;
  success?: string | null;
  onPurchase: () => void;
};

export function MembershipPlanPanel({
  plan,
  membership,
  purchasing = false,
  gatewayBypassed = false,
  error,
  success,
  onPurchase,
}: MembershipPlanPanelProps) {
  const meta = PLAN_META[plan.plan_type];
  const current = membership?.plan_type === plan.plan_type;
  const priceLabel = formatMoney(plan.price, plan.currency || "USD");
  const switching = Boolean(membership && !current);

  return (
    <div className="grid min-w-0 gap-4">
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
      {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

      <section className="membership-checkout-card rounded-2xl p-4 sm:p-5">
        <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
          {switching ? "Switch plan" : "Confirm purchase"}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="membership-checkout-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <SidebarSvgIcon name={meta.icon} size={18} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h3 className="font-sans text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)]">
              {planLabels[plan.plan_type]}
            </h3>
            <p className="text-brand-caption mt-0.5 text-[color:var(--dash-muted)]">{meta.period}</p>
          </div>
        </div>

        <dl className="mt-4 space-y-2.5">
          <CheckoutRow label="Price" value={priceLabel} />
          <CheckoutRow
            label="Term"
            value={plan.duration_days ? `${plan.duration_days} days` : meta.period}
          />
        </dl>
      </section>

      {switching ? (
        <p className="text-brand-body text-sm text-[color:var(--dash-muted)]">
          This replaces {planLabels[membership!.plan_type]} (through {formatDate(membership!.end_date)}) with{" "}
          {planLabels[plan.plan_type]}.
        </p>
      ) : (
        <p className="text-brand-body text-sm text-[color:var(--dash-muted)]">
          {gatewayBypassed
            ? `Development mode: the payment processor is skipped. ${priceLabel} is still recorded as paid.`
            : `You will be charged ${priceLabel} to complete this plan.`}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {current ? (
          <span className="dashboard-navy-btn font-sans inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-medium tracking-[0.01em] text-white opacity-70">
            This is your current plan
          </span>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="md"
            className="w-full"
            disabled={purchasing}
            onClick={onPurchase}
          >
            <SidebarSvgIcon name="check" size={15} strokeWidth={2.2} />
            {purchasing ? "Processing…" : `Pay ${priceLabel}`}
          </Button>
        )}
      </div>
    </div>
  );
}

function CheckoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] px-3.5 py-3">
      <dt className="text-brand-caption text-[color:var(--dash-faint)]">{label}</dt>
      <dd className="font-sans truncate text-sm font-semibold text-[color:var(--dash-text)]">{value}</dd>
    </div>
  );
}
