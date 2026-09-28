"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { DashRightDrawer } from "@/components/platform/provider/student/DashRightDrawer";
import { MembershipHubSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { PLAN_META } from "@/components/platform/provider/student/payment/membershipPlans";
import { MembershipListPanel } from "@/components/platform/provider/student/payment/MembershipListPanel";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getCachedAdminPlans,
  listPlans,
  updatePlanPrice,
  type Plan,
  type PlanType,
} from "@/lib/integrate/provider/admin/payment/api";
import { formatDate, formatMoney, planLabels } from "@/lib/integrate/provider/student/payment/types";
import { Button } from "@/components/ui/Button";

function isValidPriceDraft(value: string) {
  const price = Number(value);
  return value.trim() !== "" && Number.isFinite(price) && price > 0;
}

export function AdminPlansPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPlans = useCallback(async (signal?: AbortSignal) => {
    const cached = getCachedAdminPlans();
    if (cached) {
      setPlans(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await listPlans(signal);
      if (signal?.aborted) return;
      setPlans(data.items);
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
    const timer = window.setTimeout(() => void loadPlans(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadPlans]);

  const selected = plans.find((plan) => plan.plan_type === selectedPlan) ?? null;

  useEffect(() => {
    if (!selected) return;
    setPriceDraft(String(selected.price));
  }, [selected]);

  async function handleSave() {
    if (!selected) return;
    const price = Number(priceDraft);
    if (!isValidPriceDraft(priceDraft)) {
      setError("Enter a valid price greater than zero.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await updatePlanPrice(selected.plan_type, price);
      setPlans((current) =>
        current.map((plan) => (plan.plan_type === selected.plan_type ? result.plan : plan)),
      );
      setSuccess(`${planLabels[selected.plan_type]} plan price updated.`);
      setSelectedPlan(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not update plan price.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="plans-page grid w-full min-w-0 gap-3 sm:gap-4">
      {error && !selectedPlan ? <AuthAlert variant="error">{error}</AuthAlert> : null}
      {success && !selectedPlan ? <AuthAlert variant="success">{success}</AuthAlert> : null}

      {error && !loading && plans.length === 0 ? null : loading ? (
        <MembershipHubSkeleton />
      ) : (
        <MembershipListPanel
          plans={plans}
          membership={null}
          activePlanType={selectedPlan}
          onSelect={setSelectedPlan}
          statusTitle="Live membership pricing"
          statusMeta={`${plans.length} plans · shown to students`}
          ctaLabel="Edit price"
        />
      )}

      {selected ? (
        <DashRightDrawer
          eyebrow="Edit price"
          title={planLabels[selected.plan_type]}
          onClose={() => {
            if (saving) return;
            setSelectedPlan(null);
            setError(null);
            setSuccess(null);
          }}
        >
          <AdminPlanPricePanel
            plan={selected}
            priceDraft={priceDraft}
            saving={saving}
            error={error}
            success={success}
            onPriceChange={setPriceDraft}
            onSave={() => void handleSave()}
          />
        </DashRightDrawer>
      ) : null}
    </div>
  );
}

function AdminPlanPricePanel({
  plan,
  priceDraft,
  saving,
  error,
  success,
  onPriceChange,
  onSave,
}: {
  plan: Plan;
  priceDraft: string;
  saving: boolean;
  error?: string | null;
  success?: string | null;
  onPriceChange: (value: string) => void;
  onSave: () => void;
}) {
  const meta = PLAN_META[plan.plan_type];
  const priceLabel = formatMoney(plan.price, plan.currency || "USD");
  const validPrice = isValidPriceDraft(priceDraft);
  const priceChanged = validPrice && Number(priceDraft) !== Number(plan.price);

  return (
    <div className="plans-edit-sheet grid min-w-0 gap-4">
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
      {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

      <section className="dashboard-glass-card rounded-2xl p-4 sm:p-5">
        <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
          Update price
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="dashboard-tool-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--dash-text)]">
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
          <CheckoutRow label="Current price" value={priceLabel} />
          <CheckoutRow
            label="Term"
            value={plan.duration_days ? `${plan.duration_days} days` : meta.period}
          />
          {plan.updated_at ? (
            <CheckoutRow label="Updated" value={formatDate(plan.updated_at)} />
          ) : null}
        </dl>
      </section>

      <div className="grid min-w-0 gap-2">
        <label htmlFor={`admin-price-${plan.plan_type}`} className="dashboard-field-label">
          New price (USD)
        </label>
        <input
          id={`admin-price-${plan.plan_type}`}
          type="number"
          min={0.01}
          step={0.01}
          inputMode="decimal"
          value={priceDraft}
          aria-invalid={!validPrice}
          onChange={(event) => onPriceChange(event.target.value)}
          className="dashboard-field"
        />
        {!validPrice ? (
          <p className="text-brand-caption font-medium text-red-600">Price must be greater than 0.</p>
        ) : null}
      </div>

      <p className="text-brand-body text-sm text-[color:var(--dash-muted)]">
        Students see this price immediately after you save.
      </p>

      <Button
        type="button"
        disabled={saving || !validPrice || !priceChanged}
        onClick={onSave}
        className="lecture-page-action w-full px-4"
      >
        <SidebarSvgIcon name="check" size={15} strokeWidth={2.2} />
        {saving ? "Saving…" : priceChanged ? "Save price" : "No changes"}
      </Button>
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
