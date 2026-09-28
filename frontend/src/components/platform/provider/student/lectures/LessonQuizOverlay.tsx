"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { Button } from "@/components/ui/Button";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  submitLessonQuiz,
  type LessonQuizResult,
  type LessonVariant,
} from "@/lib/integrate/provider/student/lectures";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { cn } from "@/lib/utils";

const PRESTART_SECONDS = 3;
const QUIZ_DURATION_SECONDS = 5 * 60;
const QUIZ_DONE_HOLD_MS = 1700;

function QuizSuccessTick() {
  return (
    <div className="quiz-success-tick" aria-hidden>
      <svg viewBox="0 0 52 52" width="76" height="76" focusable="false">
        <circle cx="26" cy="26" r="24" fill="#dde466" />
        <path
          d="M14.5 27.2 22.2 34.5 37.5 18.5"
          fill="none"
          stroke="#142644"
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function formatQuizTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatAnswer(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key} → ${String(entry)}`)
      .join(", ");
  }
  return String(value);
}

function variantQuestion(variant: LessonVariant) {
  const content = variant.content ?? {};
  return typeof content.question === "string" ? content.question : "Question";
}

function isVariantAnswered(variant: LessonVariant, value: unknown) {
  if (variant.variant_type === "matching") {
    const leftItems = Array.isArray(variant.content?.matchingLeft)
      ? variant.content.matchingLeft.map(String)
      : [];
    if (!value || typeof value !== "object") return false;
    return leftItems.every((left) => Boolean((value as Record<string, string>)[left]));
  }
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function OptionCheck({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "quiz-option-check flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
        checked
          ? "border-[color:var(--dash-navy)] bg-[color:var(--dash-navy)] text-white"
          : "border-[color:var(--dash-dim)] bg-transparent text-transparent",
      )}
      aria-hidden
    >
      <SidebarSvgIcon name="check" size={11} strokeWidth={2.8} />
    </span>
  );
}

const choiceCardClass = (checked: boolean) =>
  cn(
    "quiz-option-card adviser-option-card adviser-choice-card font-sans flex min-h-10 min-w-0 items-center gap-3 rounded-xl border px-3.5 text-left text-sm",
    checked
      ? "is-selected"
      : "border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] text-[color:var(--dash-muted)] hols-option-hover",
  );

type LessonQuizOverlayProps = {
  open: boolean;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  variants: LessonVariant[];
  onClose: () => void;
  onSubmitted: (result: LessonQuizResult) => void;
};

function QuizQuestion({
  variant,
  disabled,
  value,
  onChange,
}: {
  variant: LessonVariant;
  disabled: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const content = variant.content ?? {};
  const options = Array.isArray(content.options) ? content.options.map(String) : null;
  const matchingLeft = Array.isArray(content.matchingLeft) ? content.matchingLeft.map(String) : null;
  const matchingOptions = Array.isArray(content.matchingOptions)
    ? content.matchingOptions.map(String)
    : null;

  if (options) {
    return (
      <fieldset className="min-w-0 space-y-2.5">
        <legend className="sr-only">Choose one answer</legend>
        <div className={cn("grid min-w-0 gap-2", options.length <= 3 ? "grid-cols-1" : "grid-cols-1")}>
          {options.map((option) => {
            const checked = value === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={checked}
                disabled={disabled}
                onClick={() => onChange(option)}
                className={choiceCardClass(checked)}
              >
                <OptionCheck checked={checked} />
                <span className="min-w-0 flex-1 break-words leading-5">{option}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (matchingLeft && matchingOptions) {
    const current = typeof value === "object" && value ? (value as Record<string, string>) : {};
    return (
      <div className="min-w-0 space-y-3">
        {matchingLeft.map((left, index) => (
          <div key={left} className="grid min-w-0 gap-1.5">
            <p className="min-w-0 break-words font-sans text-sm leading-5 text-[color:var(--dash-muted)]">{left}</p>
            <ProfileSelect
              id={`quiz-match-${index}`}
              label={left}
              hideLabel
              value={current[left] ?? ""}
              disabled={disabled}
              placeholder="Select match"
              portalToBody
              menuZIndex={200}
              options={matchingOptions.map((option) => ({ value: option, label: option }))}
              onChange={(next) =>
                onChange({
                  ...current,
                  [left]: next,
                })
              }
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <label className="grid min-w-0 gap-2">
      <span className="dashboard-field-label">Your answer</span>
      <input
        type="text"
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type your answer…"
        className={cn("dashboard-field h-10 min-h-10 text-sm", disabled && "cursor-not-allowed opacity-70")}
      />
    </label>
  );
}

export function LessonQuizOverlay({
  open,
  courseId,
  lessonId,
  variants,
  onClose,
  onSubmitted,
}: LessonQuizOverlayProps) {
  const quizTitleId = useId();
  const leaveTitleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const finishSentRef = useRef(false);
  const [phase, setPhase] = useState<"confirm" | "countdown" | "quiz" | "done">("confirm");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(PRESTART_SECONDS);
  const [quizSecondsLeft, setQuizSecondsLeft] = useState(QUIZ_DURATION_SECONDS);
  const [timedOut, setTimedOut] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [completedResult, setCompletedResult] = useState<LessonQuizResult | null>(null);
  const [mounted, setMounted] = useState(false);

  const total = variants.length;
  const currentVariant = variants[questionIndex] ?? variants[0];
  const currentAnswered = currentVariant
    ? isVariantAnswered(currentVariant, answers[currentVariant.id])
    : false;
  const answeredCount = useMemo(
    () => variants.filter((variant) => isVariantAnswered(variant, answers[variant.id])).length,
    [answers, variants],
  );
  const allAnswered = answeredCount === total && total > 0;
  const lastQuestion = questionIndex >= total - 1;
  const busy = submitting;
  const inQuiz = phase === "quiz";
  const quizDone = phase === "done";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPhase("confirm");
    setQuestionIndex(0);
    setMaxVisited(0);
    setSecondsLeft(PRESTART_SECONDS);
    setQuizSecondsLeft(QUIZ_DURATION_SECONDS);
    setTimedOut(false);
    setAnswers({});
    setSubmitting(false);
    setError(null);
    setLeaveConfirmOpen(false);
    setCompletedResult(null);
    finishSentRef.current = false;
  }, [lessonId, open]);

  function finishQuiz(result: LessonQuizResult | null = completedResult) {
    if (finishSentRef.current) return;
    finishSentRef.current = true;
    if (result) onSubmitted(result);
    onClose();
  }

  useEffect(() => {
    if (!open || phase !== "done" || !completedResult) return;
    const timer = window.setTimeout(() => {
      finishQuiz(completedResult);
    }, QUIZ_DONE_HOLD_MS);
    return () => window.clearTimeout(timer);
    // finishQuiz reads latest refs/state; intentionally omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedResult, open, phase]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [phase, questionIndex]);

  useEffect(() => {
    if (!open || phase !== "countdown" || leaveConfirmOpen) return;

    if (secondsLeft <= 0) {
      const timer = window.setTimeout(() => {
        setPhase("quiz");
      }, 650);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      setSecondsLeft((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [leaveConfirmOpen, open, phase, secondsLeft]);

  useEffect(() => {
    if (!open || phase !== "quiz" || timedOut || leaveConfirmOpen) return;

    if (quizSecondsLeft <= 0) {
      setTimedOut(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setQuizSecondsLeft((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [leaveConfirmOpen, open, phase, quizSecondsLeft, timedOut]);

  function requestLeave() {
    if (phase === "done") {
      if (completedResult) finishQuiz(completedResult);
      else onClose();
      return;
    }
    if (phase === "confirm" || timedOut) {
      onClose();
      return;
    }
    setLeaveConfirmOpen(true);
  }

  function confirmLeave() {
    setLeaveConfirmOpen(false);
    onClose();
  }

  function startCountdown() {
    setSecondsLeft(PRESTART_SECONDS);
    setPhase("countdown");
  }

  function goToQuestion(index: number) {
    if (timedOut || submitting) return;
    if (index < 0 || index >= total) return;
    if (index > maxVisited) return;
    setQuestionIndex(index);
    setError(null);
  }

  function handleBack() {
    if (questionIndex > 0) goToQuestion(questionIndex - 1);
  }

  function handleNext() {
    if (!currentAnswered || timedOut) return;
    if (!lastQuestion) {
      const next = questionIndex + 1;
      setMaxVisited((current) => Math.max(current, next));
      setQuestionIndex(next);
      setError(null);
      return;
    }
    void handleSubmit();
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (leaveConfirmOpen) {
        setLeaveConfirmOpen(false);
        return;
      }
      if (phase === "done") {
        if (completedResult) finishQuiz(completedResult);
        else onClose();
        return;
      }
      if (phase === "confirm" || timedOut) {
        onClose();
        return;
      }
      setLeaveConfirmOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [completedResult, leaveConfirmOpen, onClose, open, phase, timedOut]);

  async function handleSubmit() {
    if (timedOut || !allAnswered || phase === "done") return;

    setSubmitting(true);
    setError(null);
    try {
      const payload = await submitLessonQuiz(courseId, lessonId, {
        answers: variants.map((variant) => ({
          variant_id: variant.id,
          answer: answers[variant.id],
        })),
      });
      // Persist result immediately so the lesson page is not blank if the
      // success dialog fails to paint or auto-closes early.
      onSubmitted(payload);
      setCompletedResult(payload);
      setPhase("done");
      setLeaveConfirmOpen(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to submit quiz.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !mounted) return null;

  const countdownLabel = secondsLeft > 0 ? String(secondsLeft) : "Go!";
  const heading =
    phase === "confirm"
      ? "Do you want to continue?"
      : phase === "countdown"
        ? "Get ready"
        : phase === "done"
          ? completedResult?.passed
            ? "Quiz complete"
            : "Quiz submitted"
          : timedOut
            ? "Time is up"
            : `Question ${Math.min(questionIndex + 1, Math.max(total, 1))} of ${total}`;
  const description =
    phase === "confirm"
      ? `${total} question${total === 1 ? "" : "s"} · 5 minutes`
      : phase === "countdown" || phase === "done"
        ? ""
        : timedOut
          ? "This attempt is closed."
          : `${formatQuizTime(quizSecondsLeft)} remaining`;

  const footerButtonClass =
    "lecture-page-action font-sans inline-flex h-10 min-h-10 w-full max-w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium min-[420px]:w-auto";
  const primaryButtonClass =
    "lecture-page-action h-10 min-h-10 w-full max-w-full overflow-hidden px-5 text-sm min-[420px]:w-auto";

  return createPortal(
    <div className="adviser-dialog-overlay adviser-dialog-overlay--center fixed inset-0 z-[130] flex min-h-dvh items-center justify-center bg-black/45 px-[max(0.75rem,env(safe-area-inset-left))] py-[max(1rem,env(safe-area-inset-top),env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4 sm:py-6">
      <button
        type="button"
        aria-label="Close quiz"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (quizDone || !busy) requestLeave();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={quizTitleId}
        className={cn(
          "quiz-dialog-panel adviser-dialog-panel adviser-dialog-panel--center relative z-10 flex w-full min-w-0 flex-col overflow-hidden rounded-2xl",
          phase === "confirm" || phase === "countdown" || quizDone
            ? "max-w-md"
            : "max-h-[min(88svh,40rem)] max-w-lg sm:max-w-xl lg:max-h-[min(88svh,48rem)] lg:max-w-2xl",
        )}
      >
        {quizDone ? (
          <div className="quiz-done-panel flex min-h-[16rem] flex-col items-center justify-center px-5 py-10 text-center sm:min-h-[18rem] sm:px-6 sm:py-12">
            <QuizSuccessTick />
            <h2
              id={quizTitleId}
              className="font-sans mt-5 text-xl font-bold tracking-[0.01em] text-[#142644]"
              style={{ color: "#142644" }}
            >
              {completedResult?.passed ? "Quiz complete" : "Quiz submitted"}
            </h2>
            <p
              className="mt-1.5 font-sans text-sm"
              style={{ color: "rgba(21, 39, 68, 0.72)" }}
            >
              {completedResult
                ? `${completedResult.correct_count}/${completedResult.total_questions} correct · ${completedResult.score_percent}%`
                : "Your answers were saved."}
            </p>
            <button
              type="button"
              onClick={() => finishQuiz(completedResult)}
              className={cn(
                "dashboard-navy-btn font-semibold text-white mt-6",
                footerButtonClass,
              )}
            >
              Back to lesson
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-start justify-between gap-3 px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4">
            <div className="min-w-0 flex-1">
              <h2
                id={quizTitleId}
                className="font-sans text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl"
              >
                {heading}
              </h2>
              {description ? (
                <p className="mt-1 font-sans text-sm text-[color:var(--dash-muted)]">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={requestLeave}
              className="adviser-onboarding-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--dash-text)] transition disabled:pointer-events-none disabled:opacity-50"
              aria-label={phase === "confirm" || timedOut ? "Close quiz" : "Leave quiz"}
            >
              <SidebarSvgIcon name="cross" size={24} strokeWidth={2.25} />
            </button>
          </div>
        )}

        {phase !== "confirm" && !quizDone ? (
          <div
            ref={scrollRef}
            className={cn(
              "min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5",
              phase === "countdown" ? "py-3 sm:py-4" : "flex-1 space-y-3 py-3 sm:py-4",
            )}
          >
            {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

            {phase === "countdown" ? (
              <div className="flex flex-col items-center justify-center px-2 py-2 text-center sm:py-3">
                <p
                  className="font-sans text-5xl font-bold tabular-nums leading-none tracking-tight text-[color:var(--dash-text)] sm:text-6xl"
                  aria-live="polite"
                >
                  {countdownLabel}
                </p>
              </div>
            ) : null}

            {phase === "quiz" && timedOut ? (
              <AuthAlert variant="error">
                Time is up. You can no longer submit this quiz attempt. Go back to the lesson and try
                again.
              </AuthAlert>
            ) : null}

            {phase === "quiz" && !timedOut && currentVariant ? (
              <div key={currentVariant.id} className="space-y-3">
                <h3 className="font-sans break-words text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                  {variantQuestion(currentVariant)}
                </h3>

                <QuizQuestion
                  variant={currentVariant}
                  disabled={busy}
                  value={answers[currentVariant.id]}
                  onChange={(value) =>
                    setAnswers((current) => ({
                      ...current,
                      [currentVariant.id]: value,
                    }))
                  }
                />
              </div>
            ) : null}
          </div>
        ) : error ? (
          <div className="px-4 pb-2 sm:px-5">
            <AuthAlert variant="error">{error}</AuthAlert>
          </div>
        ) : null}

        {!quizDone ? (
          <div className="flex shrink-0 flex-col-reverse gap-2 px-4 py-3.5 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:justify-end min-[420px]:gap-2.5 sm:px-5 sm:py-4">
            {phase === "confirm" ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className={cn("dashboard-navy-btn font-semibold text-white", footerButtonClass)}
                >
                  Cancel
                </button>
                <Button type="button" size="sm" onClick={startCountdown} className={primaryButtonClass}>
                  Continue
                </Button>
              </>
            ) : null}

            {phase === "countdown" || timedOut ? (
              <button
                type="button"
                onClick={timedOut ? onClose : requestLeave}
                className={cn("dashboard-navy-btn font-semibold text-white", footerButtonClass)}
              >
                Back to lesson
              </button>
            ) : null}

            {inQuiz && !timedOut ? (
              <>
                {questionIndex > 0 ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={busy}
                    className={cn(
                      "dashboard-navy-btn font-semibold text-white disabled:pointer-events-none disabled:opacity-50",
                      footerButtonClass,
                    )}
                  >
                    Back
                  </button>
                ) : null}
                <Button
                  key={`quiz-continue-${questionIndex}`}
                  type="button"
                  size="sm"
                  disabled={!currentAnswered || busy || (lastQuestion && !allAnswered)}
                  onClick={handleNext}
                  className={primaryButtonClass}
                >
                  {submitting ? "Submitting…" : lastQuestion ? "Submit quiz" : "Continue"}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {leaveConfirmOpen ? (
        <div className="adviser-dialog-overlay adviser-dialog-overlay--center absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-[max(0.75rem,env(safe-area-inset-left))] py-[max(1rem,env(safe-area-inset-top),env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4 sm:py-6">
          <button
            type="button"
            aria-label="Dismiss leave dialog"
            className="absolute inset-0 cursor-default"
            onClick={() => setLeaveConfirmOpen(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={leaveTitleId}
            className="quiz-dialog-panel adviser-dialog-panel adviser-dialog-panel--center relative z-10 flex w-full max-w-md min-w-0 flex-col overflow-hidden rounded-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4 md:px-6">
              <div className="min-w-0">
                <h2
                  id={leaveTitleId}
                  className="font-sans text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl"
                >
                  Do you want to cancel this quiz?
                </h2>
                <p className="mt-1 font-sans text-sm text-[color:var(--dash-muted)]">
                  Your progress will not be saved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLeaveConfirmOpen(false)}
                className="adviser-onboarding-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--dash-text)] transition"
                aria-label="Keep taking quiz"
              >
                <SidebarSvgIcon name="cross" size={24} strokeWidth={2.25} />
              </button>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 px-4 py-3.5 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:justify-end min-[420px]:gap-2.5 sm:px-5 sm:py-4">
              <button
                type="button"
                onClick={confirmLeave}
                className={cn("dashboard-navy-btn font-semibold text-white", footerButtonClass)}
              >
                Yes, cancel quiz
              </button>
              <Button
                type="button"
                size="sm"
                onClick={() => setLeaveConfirmOpen(false)}
                className={primaryButtonClass}
              >
                Keep taking quiz
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

type LessonQuizResultCardProps = {
  result: LessonQuizResult;
  courseId: string;
  onRetake: () => void;
};

export function LessonQuizResultCard({ result, courseId, onRetake }: LessonQuizResultCardProps) {
  return (
    <section className="dashboard-glass-card rounded-2xl p-4 sm:p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
            Latest quiz result
          </p>
          <h3 className="font-sans mt-1 text-lg font-semibold tracking-[0.005em] text-[color:var(--dash-text)] md:text-xl">
            {result.score_percent}% · {result.correct_count}/{result.total_questions} correct
          </h3>
          <p className="text-brand-body mt-1 text-[color:var(--dash-muted)]">
            {result.passed ? "You passed this lesson quiz." : "Review the lesson and try again when ready."}
          </p>
        </div>
        <span className="dashboard-pill-soft text-brand-caption inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold text-[color:var(--dash-text)]">
          <SidebarSvgIcon name={result.passed ? "check" : "quiz"} size={13} />
          {result.passed ? "Passed" : "Needs review"}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {result.answers.map((answer) => (
          <div
            key={answer.variant_id}
            className="text-brand-body hols-option-hover flex items-start gap-2 rounded-xl border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] px-3.5 py-3"
          >
            <span className="dashboard-tool-icon mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
              <SidebarSvgIcon name={answer.is_correct ? "check" : "cross"} size={14} />
            </span>
            <div className="min-w-0">
              <span className="font-medium text-[color:var(--dash-text)]">{answer.question ?? "Question"}</span>
              <span className="text-[color:var(--dash-faint)]">
                {" "}
                · {answer.is_correct ? "Correct" : "Incorrect"}
              </span>
              {!answer.is_correct ? (
                <p className="mt-1 text-[color:var(--dash-faint)]">
                  Correct answer: {formatAnswer(answer.correct_answer)}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="@container mt-4 flex min-w-0 flex-col-reverse gap-2 @min-[24rem]:flex-row @min-[24rem]:flex-wrap">
        <Link
          href={`/student/lectures/${courseId}/test-result`}
          className="dashboard-pill-soft font-sans inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-full px-5 text-center text-sm font-medium text-[color:var(--dash-text)] @min-[24rem]:min-h-10 @min-[24rem]:w-auto"
        >
          View all test results
        </Link>
        <button
          type="button"
          onClick={onRetake}
          className="dashboard-navy-btn font-sans inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white @min-[24rem]:min-h-10 @min-[24rem]:w-auto"
        >
          <SidebarSvgIcon name="quiz" size={15} />
          Take quiz again
        </button>
      </div>
    </section>
  );
}
