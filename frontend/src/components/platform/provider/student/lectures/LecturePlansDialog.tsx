"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { sortedPlans } from "@/components/platform/provider/student/payment/membershipPlans";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { ApiRequestError } from "@/lib/integrate/client";
import { getCachedPlans, listPlans, type Plan } from "@/lib/integrate/provider/student/payment/api";
import { formatMoney, planLabels } from "@/lib/integrate/provider/student/payment/types";

export function LecturePlansDialog({
  open,
  onClose,
  title = "Unveil the power of lecture",
  description = "View a plan to open this lecture.",
  stacked = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  stacked?: boolean;
}) {
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const plansRes = await listPlans(signal);
      if (signal?.aborted) return;
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
    if (!open) return;
    const cachedPlans = getCachedPlans();
    if (cachedPlans !== undefined) {
      setPlans(cachedPlans ?? []);
      setLoading(false);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadData(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadData, open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`adviser-dialog-overlay adviser-dialog-overlay--center fixed inset-0 flex min-h-dvh items-center justify-center bg-black/45 px-4 py-6 ${stacked ? "z-[140]" : "z-[80]"}`}
    >
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="adviser-dialog-panel adviser-dialog-panel--center relative z-10 w-full max-w-sm px-5 pt-5 pb-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-sans min-w-0 text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)]">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="adviser-onboarding-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--dash-text)] transition"
          >
            <SidebarSvgIcon name="cross" size={24} strokeWidth={2.25} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-5 text-[color:var(--dash-muted)]">
          {description}
        </p>
        <div className="mt-4 grid gap-2">
          {error ? <p className="text-sm text-[#9b2c2c]">{error}</p> : null}
          {loading && plans.length === 0 ? (
            <p className="py-4 text-center text-sm text-[color:var(--dash-muted)]">Loading plans…</p>
          ) : (
            sortedPlans(plans).map((plan) => (
              <div
                key={plan.plan_type}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[rgba(21,39,68,0.12)] bg-[#f7f8fa] px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block font-sans text-sm font-semibold text-[#152744]">
                    {planLabels[plan.plan_type]}
                  </span>
                  <span className="block text-xs text-[#5c6b82]">
                    {formatMoney(plan.price, plan.currency || "USD")}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
        <Button href="/student/plans" size="sm" className="lecture-page-action mt-4 h-10 min-h-10 w-full px-5 text-sm">
          View Plan
        </Button>
      </section>
    </div>,
    document.body,
  );
}
