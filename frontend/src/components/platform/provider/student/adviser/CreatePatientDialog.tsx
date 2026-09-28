"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { Button } from "@/components/ui/Button";

type CreatePatientDialogProps = {
  open: boolean;
  defaultName: string;
  isSubmitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (displayName: string) => void;
};

export function CreatePatientDialog({
  open,
  defaultName,
  isSubmitting = false,
  error = null,
  onClose,
  onSubmit,
}: CreatePatientDialogProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 30);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [defaultName, open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSubmitting, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const canSubmit = Boolean(name.trim()) && !isSubmitting;

  return createPortal(
    <div className="adviser-dialog-overlay adviser-dialog-overlay--center fixed inset-0 z-[80] flex min-h-dvh items-end justify-center overflow-y-auto bg-black/45 px-[max(0.75rem,env(safe-area-inset-left))] py-[max(0.75rem,env(safe-area-inset-top),env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:items-center sm:px-4 sm:py-6">
      <button
        type="button"
        aria-label="Close create patient dialog"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="adviser-dialog-panel adviser-dialog-panel--center @container relative z-10 my-auto flex max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-md flex-col overflow-hidden rounded-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed || isSubmitting) return;
          onSubmit(trimmed);
        }}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2
            id={titleId}
            className="font-sans min-w-0 text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl"
          >
            New patient
          </h2>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="adviser-onboarding-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--dash-text)] transition disabled:pointer-events-none disabled:opacity-50"
            aria-label="Close dialog"
          >
            <SidebarSvgIcon name="cross" size={24} strokeWidth={2.25} />
          </button>
        </div>

        <div className="space-y-3 px-5 pb-4">
          <label className="grid min-w-0 gap-1.5">
            <span className="dashboard-field-label">Patient name</span>
            <input
              ref={inputRef}
              type="text"
              required
              maxLength={120}
              value={name}
              disabled={isSubmitting}
              placeholder="e.g. Patient A"
              enterKeyHint="done"
              autoComplete="off"
              onChange={(event) => setName(event.target.value)}
              className="dashboard-field adviser-field h-10 min-h-10 text-sm"
            />
          </label>

          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
        </div>

        <div className="flex flex-col-reverse gap-2 px-5 pb-5 @min-[22rem]:flex-row @min-[22rem]:justify-end @min-[22rem]:gap-2.5">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="dashboard-navy-btn lecture-page-action font-sans inline-flex h-10 min-h-10 w-full items-center justify-center rounded-full px-5 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-50 @min-[22rem]:w-auto"
          >
            Cancel
          </button>
          <Button
            type="submit"
            size="sm"
            disabled={!canSubmit}
            className="lecture-page-action h-10 min-h-10 w-full overflow-hidden px-5 text-sm @min-[22rem]:w-auto"
          >
            {isSubmitting ? "Creating…" : "Create patient"}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
