"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/integrate/provider/student/payment/types";

type RequestPayoutDialogProps = {
  open: boolean;
  available: number;
  currency: string;
  lockDays: number;
  loading?: boolean;
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (amount?: number) => void;
};

export function RequestPayoutDialog({
  open,
  available,
  currency,
  lockDays,
  loading = false,
  isSubmitting = false,
  error = null,
  onClose,
  onSubmit,
}: RequestPayoutDialogProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amountDraft, setAmountDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmountDraft("");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      if (loading) return;
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 30);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [loading, open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSubmitting, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const trimmed = amountDraft.trim();
  const parsed = trimmed ? Number(trimmed) : undefined;
  const invalidAmount = Boolean(trimmed) && (Number.isNaN(parsed) || (parsed ?? 0) <= 0);
  const exceedsAvailable = parsed != null && parsed > available;
  const canSubmit = available > 0 && !isSubmitting && !invalidAmount && !exceedsAvailable;

  return createPortal(
    <div className="adviser-dialog-overlay adviser-dialog-overlay--center fixed inset-0 z-[80] flex min-h-dvh items-end justify-center overflow-y-auto bg-black/45 px-[max(0.75rem,env(safe-area-inset-left))] py-[max(0.75rem,env(safe-area-inset-top),env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:items-center sm:px-4 sm:py-6">
      <button
        type="button"
        aria-label="Close request payout dialog"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="adviser-dialog-panel adviser-dialog-panel--center @container relative z-10 my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md min-w-0 flex-col overflow-hidden rounded-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onSubmit(parsed);
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--dash-surface-border)] px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4 md:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
              Payout
            </p>
            <h2
              id={titleId}
              className="font-sans mt-1 break-words text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl"
            >
              Request payout
            </h2>
            {loading ? (
              <span className="dashboard-skeleton-block mt-2 block h-4 w-full max-w-xs rounded-full" aria-hidden />
            ) : (
              <p className="text-brand-body mt-1 break-words text-sm text-[color:var(--dash-muted)] sm:text-base">
                Available {formatMoney(available, currency)}. Leave amount blank to request the full
                balance.
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="adviser-onboarding-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--dash-text)] transition disabled:pointer-events-none disabled:opacity-50"
            aria-label="Close request payout"
          >
            <SidebarSvgIcon name="cross" size={22} strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5 md:px-6">
          {loading ? (
            <div aria-busy="true" aria-label="Loading payout request">
              <span className="dashboard-skeleton-block block h-3.5 w-28 max-w-full rounded-full" />
              <span className="dashboard-skeleton-block mt-2 block h-12 w-full rounded-[0.875rem]" />
              <span className="dashboard-skeleton-block mt-4 block h-3 w-full rounded-full" />
              <span className="dashboard-skeleton-block mt-2 block h-3 w-4/5 max-w-full rounded-full" />
            </div>
          ) : (
            <>
          <label className="grid min-w-0 gap-2">
            <span className="dashboard-field-label">Amount ({currency})</span>
            <input
              ref={inputRef}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={amountDraft}
              disabled={isSubmitting || available <= 0}
              placeholder={String(available)}
              autoComplete="off"
              onChange={(event) => setAmountDraft(event.target.value)}
              className="dashboard-field adviser-number-field min-w-0 max-w-full"
            />
          </label>
          <p className="text-brand-caption break-words text-[color:var(--dash-faint)]">
            {lockDays === 0
              ? "New commission is available immediately."
              : `New commission is held for ${lockDays} day${lockDays === 1 ? "" : "s"}, then an hourly check moves it into available.`}
          </p>
          {invalidAmount ? <AuthAlert variant="error">Enter an amount greater than 0.</AuthAlert> : null}
          {exceedsAvailable ? (
            <AuthAlert variant="error">
              Amount exceeds available {formatMoney(available, currency)}.
            </AuthAlert>
          ) : null}
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[color:var(--dash-surface-border)] px-4 py-3.5 @min-[22rem]:flex-row @min-[22rem]:justify-end @min-[22rem]:gap-2.5 sm:px-5 sm:py-4 md:px-6">
          {loading ? (
            <>
              <span className="dashboard-skeleton-block h-10 w-full rounded-full @min-[22rem]:w-24" aria-hidden />
              <span className="dashboard-skeleton-block h-10 w-full rounded-full @min-[22rem]:w-40" aria-hidden />
            </>
          ) : (
            <>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium text-[color:var(--dash-text)] disabled:pointer-events-none disabled:opacity-50 @min-[22rem]:w-auto"
          >
            Cancel
          </button>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="lecture-page-action w-full px-5 @min-[22rem]:w-auto"
          >
            {isSubmitting ? (
              <>
                <SidebarSvgIcon name="spinner" size={16} strokeWidth={2.5} className="animate-spin" />
                Sending request…
              </>
            ) : (
              <>
                <SidebarSvgIcon name="payment" size={15} strokeWidth={2.2} />
                Request payout
              </>
            )}
          </Button>
            </>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}
