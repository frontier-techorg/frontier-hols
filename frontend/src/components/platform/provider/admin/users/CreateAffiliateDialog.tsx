"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { Button } from "@/components/ui/Button";

export type CreateAffiliateFormValues = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  margin_percent: string;
  invitation_quota: string;
};

const emptyForm: CreateAffiliateFormValues = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  margin_percent: "",
  invitation_quota: "",
};

type CreateAffiliateDialogProps = {
  open: boolean;
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: CreateAffiliateFormValues) => void;
};

function isValidMargin(value: string) {
  const margin = Number(value);
  return value.trim() !== "" && Number.isFinite(margin) && margin > 0 && margin < 100;
}

export function CreateAffiliateDialog({
  open,
  isSubmitting = false,
  error = null,
  onClose,
  onSubmit,
}: CreateAffiliateDialogProps) {
  const titleId = useId();
  const firstNameRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CreateAffiliateFormValues>(emptyForm);
  const [phase, setPhase] = useState<"form" | "confirm">("form");

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setPhase("form");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => firstNameRef.current?.focus(), 30);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        if (phase === "confirm") {
          setPhase("form");
          return;
        }
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSubmitting, onClose, open, phase]);

  if (!open || typeof document === "undefined") return null;

  const marginValid = isValidMargin(form.margin_percent);
  const canSubmit =
    Boolean(form.first_name.trim()) &&
    Boolean(form.last_name.trim()) &&
    Boolean(form.email.trim()) &&
    marginValid &&
    !isSubmitting;

  const trimmed = {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    email: form.email.trim(),
    password: form.password.trim(),
    margin_percent: form.margin_percent.trim(),
    invitation_quota: form.invitation_quota.trim(),
  };

  return createPortal(
    <div className="adviser-dialog-overlay adviser-dialog-overlay--center fixed inset-0 z-[80] flex min-h-dvh items-center justify-center bg-black/45 px-[max(0.75rem,env(safe-area-inset-left))] py-[max(1rem,env(safe-area-inset-top),env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4 sm:py-6">
      <button
        type="button"
        aria-label="Close create affiliate dialog"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="adviser-dialog-panel adviser-dialog-panel--center relative z-10 flex max-h-[min(88svh,46rem)] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          if (phase === "form") {
            setPhase("confirm");
            return;
          }
          onSubmit(trimmed);
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--dash-surface-border)] px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4 md:px-6">
          <div className="min-w-0">
            <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
              Affiliates
            </p>
            <h2
              id={titleId}
              className="font-sans mt-1 text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl"
            >
              {phase === "confirm" ? "Confirm new affiliate" : "New affiliate"}
            </h2>
            <p className="text-brand-body mt-1 text-sm text-[color:var(--dash-muted)] sm:text-base">
              {phase === "confirm"
                ? "Review the details below. Creating the account emails login credentials and the invite code."
                : "Invite code is generated and sent with the credentials email."}
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="adviser-onboarding-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--dash-text)] disabled:pointer-events-none disabled:opacity-50"
            aria-label="Close dialog"
          >
            <SidebarSvgIcon name="cross" size={22} strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5 md:px-6">
          {phase === "confirm" ? (
            <div className="space-y-3 rounded-xl border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] p-4">
              <ConfirmRow label="Name" value={`${trimmed.first_name} ${trimmed.last_name}`} />
              <ConfirmRow label="Email" value={trimmed.email} />
              <ConfirmRow
                label="Password"
                value={trimmed.password ? "Custom password set" : "Auto-generated"}
              />
              <ConfirmRow label="Margin" value={`${trimmed.margin_percent}%`} />
              <ConfirmRow
                label="Invitation quota"
                value={trimmed.invitation_quota || "Unlimited"}
              />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid min-w-0 gap-2">
                  <span className="dashboard-field-label">First name</span>
                  <input
                    ref={firstNameRef}
                    type="text"
                    required
                    autoComplete="given-name"
                    disabled={isSubmitting}
                    value={form.first_name}
                    placeholder="e.g. Jordan"
                    onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
                    className="dashboard-field"
                  />
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="dashboard-field-label">Last name</span>
                  <input
                    type="text"
                    required
                    autoComplete="family-name"
                    disabled={isSubmitting}
                    value={form.last_name}
                    placeholder="e.g. Lee"
                    onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
                    className="dashboard-field"
                  />
                </label>
              </div>

              <label className="grid min-w-0 gap-2">
                <span className="dashboard-field-label">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  disabled={isSubmitting}
                  value={form.email}
                  placeholder="partner@example.com"
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="dashboard-field"
                />
              </label>

              <label className="grid min-w-0 gap-2">
                <span className="dashboard-field-label">Password</span>
                <input
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  value={form.password}
                  placeholder="Leave blank to auto-generate"
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  className="dashboard-field"
                />
                <span className="text-brand-caption text-[color:var(--dash-faint)]">
                  Optional · minimum 8 characters if set
                </span>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid min-w-0 gap-2">
                  <span className="dashboard-field-label">Margin %</span>
                  <input
                    type="number"
                    required
                    min={0.01}
                    max={99.99}
                    step={0.01}
                    disabled={isSubmitting}
                    aria-invalid={!marginValid && form.margin_percent.trim() !== ""}
                    value={form.margin_percent}
                    placeholder="e.g. 10"
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, margin_percent: event.target.value }))
                    }
                    className="dashboard-field adviser-number-field"
                  />
                  {!marginValid && form.margin_percent.trim() !== "" ? (
                    <span className="text-brand-caption font-medium text-red-600">
                      Must be greater than 0 and less than 100.
                    </span>
                  ) : (
                    <span className="text-brand-caption text-[color:var(--dash-faint)]">
                      Required · greater than 0 and less than 100
                    </span>
                  )}
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="dashboard-field-label">Invitation quota</span>
                  <input
                    type="number"
                    min={0}
                    disabled={isSubmitting}
                    value={form.invitation_quota}
                    placeholder="Unlimited if blank"
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, invitation_quota: event.target.value }))
                    }
                    className="dashboard-field adviser-number-field"
                  />
                  <span className="text-brand-caption text-[color:var(--dash-faint)]">
                    Optional · leave blank for unlimited
                  </span>
                </label>
              </div>
            </>
          )}

          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--dash-surface-border)] px-4 py-3.5 sm:flex-row sm:justify-end sm:gap-2.5 sm:px-5 sm:py-4 md:px-6">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              if (phase === "confirm") {
                setPhase("form");
                return;
              }
              onClose();
            }}
            className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium text-[color:var(--dash-text)] disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          >
            {phase === "confirm" ? (
              <>
                <SidebarSvgIcon name="previous" size={14} strokeWidth={2.2} />
                Back
              </>
            ) : (
              "Cancel"
            )}
          </button>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="lecture-page-action w-full px-5 sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <SidebarSvgIcon name="spinner" size={16} strokeWidth={2.5} className="animate-spin" />
                Creating…
              </>
            ) : phase === "confirm" ? (
              "Confirm & create"
            ) : (
              <>
                Continue
                <SidebarSvgIcon name="next" size={14} strokeWidth={2.2} />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className="text-brand-caption shrink-0 font-medium text-[color:var(--dash-faint)]">
        {label}
      </span>
      <span className="font-sans min-w-0 break-words text-right text-sm font-semibold text-[color:var(--dash-text)]">
        {value}
      </span>
    </div>
  );
}
