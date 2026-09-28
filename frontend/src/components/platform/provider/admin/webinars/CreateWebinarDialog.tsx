"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import {
  WebinarCoverPicker,
  WebinarDateTimeField,
} from "@/components/platform/provider/admin/webinars/WebinarCoverPicker";
import {
  WEBINAR_STATUS_OPTIONS,
  isValidJoinUrl,
  isWebinarStatus,
  normalizeJoinUrl,
  toLocalInputValue,
  type WebinarStatus,
} from "@/components/platform/provider/admin/webinars/webinarForm";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { Button } from "@/components/ui/Button";

export type CreateWebinarFormValues = {
  title: string;
  description?: string;
  starts_at: string;
  price: number;
  capacity: number;
  join_url: string;
  status: "draft" | "published" | "cancelled" | "completed";
  coverFile: File;
};

type FormState = {
  title: string;
  description: string;
  starts_at: string;
  price: string;
  capacity: string;
  join_url: string;
  status: WebinarStatus;
};

function emptyForm(): FormState {
  return {
    title: "",
    description: "",
    starts_at: toLocalInputValue(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
    price: "0",
    capacity: "100",
    join_url: "",
    status: "published",
  };
}

type CreateWebinarDialogProps = {
  open: boolean;
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: CreateWebinarFormValues) => void;
};

export function CreateWebinarDialog({
  open,
  isSubmitting = false,
  error = null,
  onClose,
  onSubmit,
}: CreateWebinarDialogProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [joinTouched, setJoinTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setCoverFile(null);
    setCoverError(null);
    setJoinTouched(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => titleRef.current?.focus(), 30);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSubmitting, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const title = form.title.trim();
  const joinUrl = normalizeJoinUrl(form.join_url);
  const capacityRaw = form.capacity.trim();
  const capacity = Number(capacityRaw);
  const startsAt = new Date(form.starts_at);
  const joinValid = isValidJoinUrl(form.join_url);
  const startsValid = Number.isFinite(startsAt.getTime()) && startsAt.getTime() > Date.now();
  const capacityValid = Boolean(capacityRaw) && Number.isInteger(capacity) && capacity >= 1;
  const coverValid = Boolean(coverFile) && !coverError;
  const canSubmit =
    Boolean(title) && joinValid && startsValid && capacityValid && coverValid && !isSubmitting;

  return createPortal(
    <div className="adviser-dialog-overlay adviser-dialog-overlay--center fixed inset-0 z-[80] flex min-h-dvh items-center justify-center bg-black/45 px-[max(0.75rem,env(safe-area-inset-left))] py-[max(1rem,env(safe-area-inset-top),env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4 sm:py-6">
      <button
        type="button"
        aria-label="Close create webinar dialog"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="adviser-dialog-panel adviser-dialog-panel--center webinars-page relative z-10 flex max-h-[min(88svh,52rem)] w-full max-w-3xl min-w-0 flex-col overflow-hidden rounded-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit || !coverFile) {
            if (!coverFile) setCoverError("Cover image is required.");
            if (!joinValid) setJoinTouched(true);
            return;
          }
          onSubmit({
            title,
            description: form.description.trim() || undefined,
            starts_at: startsAt.toISOString(),
            price: Number(form.price) || 0,
            capacity,
            join_url: joinUrl,
            status: form.status,
            coverFile,
          });
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--dash-surface-border)] px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4 md:px-6">
          <div className="min-w-0">
            <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
              Webinars
            </p>
            <h2
              id={titleId}
              className="font-sans mt-1 text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl"
            >
              New webinar
            </h2>
            <p className="text-brand-body mt-1 text-sm text-[color:var(--dash-muted)] sm:text-base">
              Cover image and join link are required before you can create the session.
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="adviser-onboarding-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--dash-text)] transition disabled:pointer-events-none disabled:opacity-50"
            aria-label="Close dialog"
          >
            <SidebarSvgIcon name="cross" size={22} strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5 md:px-6">
          <WebinarCoverPicker
            file={coverFile}
            disabled={isSubmitting}
            error={coverError}
            dropzoneClassName="!max-w-none !aspect-auto h-36 sm:h-40"
            onFileChange={(next, nextError) => {
              setCoverFile(next);
              setCoverError(nextError);
            }}
          />

          <label className="grid min-w-0 gap-2">
            <span className="dashboard-field-label">
              Title
              <span className="text-red-600" aria-hidden>
                {" "}
                *
              </span>
            </span>
            <input
              ref={titleRef}
              type="text"
              required
              disabled={isSubmitting}
              value={form.title}
              placeholder="e.g. Peptide dosing clinic"
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="dashboard-field"
            />
          </label>

          <div className="grid min-w-0 gap-3">
            <div className="grid min-w-0 gap-2">
              <WebinarDateTimeField
                required
                label="Starts at"
                disabled={isSubmitting}
                value={form.starts_at}
                onChange={(value) => setForm((prev) => ({ ...prev, starts_at: value }))}
              />
              {!startsValid && form.starts_at ? (
                <span className="text-brand-caption font-medium text-red-600">
                  Start time must be in the future.
                </span>
              ) : null}
            </div>

            <ProfileSelect
              id="create-webinar-status"
              label="Status"
              value={form.status}
              disabled={isSubmitting}
              portalToBody
              menuZIndex={130}
              onChange={(value) => {
                if (!isWebinarStatus(value)) return;
                setForm((prev) => ({ ...prev, status: value }));
              }}
              options={[...WEBINAR_STATUS_OPTIONS]}
            />
          </div>

          <label className="grid min-w-0 gap-2">
            <span className="dashboard-field-label">
              Join link
              <span className="text-red-600" aria-hidden>
                {" "}
                *
              </span>
            </span>
            <input
              type="text"
              inputMode="url"
              autoComplete="url"
              required
              disabled={isSubmitting}
              value={form.join_url}
              placeholder="https://zoom.us/j/…"
              aria-invalid={joinTouched && !joinValid}
              onBlur={() => setJoinTouched(true)}
              onChange={(event) => setForm((prev) => ({ ...prev, join_url: event.target.value }))}
              className="dashboard-field"
            />
            {joinTouched && !joinValid ? (
              <span className="text-brand-caption font-medium text-red-600">
                Enter a valid https join link.
              </span>
            ) : (
              <span className="text-brand-caption text-[color:var(--dash-faint)]">
                Required. Students use this to join live.
              </span>
            )}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-2">
              <span className="dashboard-field-label">Price (USD)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                disabled={isSubmitting}
                value={form.price}
                onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                className="dashboard-field adviser-number-field"
              />
            </label>
            <label className="grid min-w-0 gap-2">
              <span className="dashboard-field-label">
                Capacity
                <span className="text-red-600" aria-hidden>
                  {" "}
                  *
                </span>
              </span>
              <input
                type="number"
                required
                min={1}
                step={1}
                inputMode="numeric"
                disabled={isSubmitting}
                value={form.capacity}
                onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
                className="dashboard-field adviser-number-field"
              />
            </label>
          </div>

          <label className="grid min-w-0 gap-2">
            <span className="dashboard-field-label">Description</span>
            <textarea
              disabled={isSubmitting}
              value={form.description}
              rows={3}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="dashboard-field min-h-[6rem] resize-y"
            />
          </label>

          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--dash-surface-border)] px-4 py-3.5 sm:flex-row sm:justify-end sm:gap-2.5 sm:px-5 sm:py-4 md:px-6">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 min-h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium text-[color:var(--dash-text)] disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          >
            Cancel
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
            ) : (
              <>
                <SidebarSvgIcon name="plus" size={15} strokeWidth={2.2} />
                Create webinar
              </>
            )}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
