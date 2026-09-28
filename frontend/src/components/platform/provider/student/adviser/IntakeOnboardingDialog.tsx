"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { INTAKE_STAGES, IntakeWizard } from "@/components/platform/provider/student/adviser/IntakeWizard";
import { Button } from "@/components/ui/Button";
import type {
  IntakeAnswers,
  QuestionnaireFlow,
} from "@/lib/integrate/provider/student/chat";

type IntakeOnboardingDialogProps = {
  open: boolean;
  patientName: string;
  flow: QuestionnaireFlow;
  step: number;
  answers: IntakeAnswers;
  isSaving?: boolean;
  isGenerating?: boolean;
  error?: string | null;
  showRecommendPrompt?: boolean;
  accessLocked?: boolean;
  onClose: () => void;
  onStepChange: (step: number) => void;
  onAnswersChange: (answers: IntakeAnswers) => void;
  onComplete: () => void;
  onGenerate: () => void;
};

export function IntakeOnboardingDialog({
  open,
  patientName,
  flow,
  step,
  answers,
  isSaving = false,
  isGenerating = false,
  error = null,
  showRecommendPrompt = false,
  accessLocked = false,
  onClose,
  onStepChange,
  onAnswersChange,
  onComplete,
  onGenerate,
}: IntakeOnboardingDialogProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving && !isGenerating) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isGenerating, isSaving, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const totalSteps = 7;
  const currentStep = showRecommendPrompt ? totalSteps : Math.min(step + 1, totalSteps);
  const progressPercent = Math.round((currentStep / totalSteps) * 100);
  const busy = isSaving || isGenerating;
  const stageLabel = showRecommendPrompt
    ? "Recommendation"
    : INTAKE_STAGES[Math.min(step, INTAKE_STAGES.length - 1)];

  return createPortal(
    <div className="adviser-dialog-overlay adviser-onboarding-overlay adviser-dialog-overlay--center fixed inset-0 z-[80] flex min-h-dvh items-end justify-center overflow-y-auto px-[max(0.75rem,env(safe-area-inset-left))] py-[max(0.75rem,env(safe-area-inset-top),env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:items-center sm:px-4 sm:py-6">
      <button
        type="button"
        aria-label="Close onboarding dialog"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!busy) onClose();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Onboarding for ${patientName}`}
        className="adviser-dialog-panel adviser-dialog-panel--center adviser-onboarding-panel @container relative z-10 my-auto flex max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-lg flex-col overflow-hidden rounded-2xl sm:max-w-xl"
      >
        <div className="shrink-0 px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-sans truncate text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl">
                {patientName}
              </h2>
              <p className="mt-1 font-sans text-sm font-medium break-words text-[rgba(21,39,68,0.72)]">{stageLabel}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="adviser-onboarding-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--dash-text)] transition disabled:pointer-events-none disabled:opacity-50"
              aria-label="Close patient onboarding"
            >
              <SidebarSvgIcon name="cross" size={24} strokeWidth={2.25} />
            </button>
          </div>

          <div
            className="adviser-onboarding-bar mt-4"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-label={`${stageLabel}, step ${currentStep} of ${totalSteps}`}
          >
            <span style={{ width: `${progressPercent}%` }} />
          </div>

          <ol className="adviser-progress-steps mt-3 flex items-center justify-between gap-1">
            {INTAKE_STAGES.slice(0, totalSteps).map((label, index) => {
              const done = showRecommendPrompt || index < step;
              const current = !showRecommendPrompt && index === step;
              const canJump = !showRecommendPrompt && !busy && index < step;
              const className = `adviser-progress-dot${done ? " is-done" : ""}${current ? " is-current" : ""}`;
              const mark = String(index + 1);
              if (canJump) {
                return (
                  <li key={label} className="min-w-0 flex-1">
                    <button
                      type="button"
                      className={className}
                      aria-label={`Back to ${label}`}
                      onClick={() => onStepChange(index)}
                    >
                      {mark}
                    </button>
                  </li>
                );
              }
              return (
                <li key={label} className="min-w-0 flex-1">
                  <span className={className} aria-current={current ? "step" : undefined} aria-label={label}>
                    {mark}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">

            {error ? (
              <div className="shrink-0 px-3.5 pt-3 sm:px-5 sm:pt-4 md:px-6">
                <AuthAlert variant="error">{error}</AuthAlert>
              </div>
            ) : null}

            {isSaving || isGenerating || showRecommendPrompt ? (
              <div className="adviser-onboarding-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3.5 sm:p-5 md:p-6">
                {isSaving ? (
                  <div className="adviser-onboarding-card p-5 text-center sm:p-8">
                    <SidebarSvgIcon name="spinner" size={18} strokeWidth={2} className="mx-auto mb-3 animate-spin text-[color:var(--dash-text)]" />
                    <p className="text-sm text-[color:var(--dash-muted)]">Saving intake…</p>
                  </div>
                ) : null}

                {isGenerating ? (
                  <div className="adviser-onboarding-card p-5 text-center sm:p-8">
                    <SidebarSvgIcon name="spinner" size={18} strokeWidth={2} className="mx-auto mb-3 animate-spin text-[color:var(--dash-text)]" />
                    <p className="text-sm text-[color:var(--dash-muted)]">Generating recommendation…</p>
                  </div>
                ) : null}

                {!busy && showRecommendPrompt ? (
                  <div className="adviser-onboarding-card p-5 text-center sm:p-8">
                    <span className="adviser-progress-dot is-done mx-auto" aria-hidden>
                      <SidebarSvgIcon name="check" size={16} strokeWidth={2.4} />
                    </span>
                    <p className="mt-3 font-sans text-sm text-[color:var(--dash-muted)]">Intake saved.</p>
                    {accessLocked ? (
                      <button
                        type="button"
                        onClick={onGenerate}
                        className="dashboard-navy-btn font-sans mt-4 inline-flex h-10 min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white @min-[22rem]:w-auto"
                      >
                        <SidebarSvgIcon name="lock" size={15} strokeWidth={2.1} />
                        Generate recommendation
                      </button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={onGenerate}
                        className="lecture-page-action mt-4 h-10 min-h-10 w-full overflow-hidden px-5 text-sm @min-[22rem]:w-auto"
                      >
                        Generate recommendation
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3.5 pb-3.5 pt-3 sm:px-5 sm:pb-5 sm:pt-4 md:px-6 md:pb-6">
                <IntakeWizard
                  bare
                  flow={flow}
                  step={step}
                  answers={answers}
                  onStepChange={onStepChange}
                  onAnswersChange={onAnswersChange}
                  onComplete={onComplete}
                />
              </div>
            )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
