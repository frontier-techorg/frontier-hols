"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { Button } from "@/components/ui/Button";
import { authFieldClass, authLabelClass } from "@/components/platform/auth/auth-styles";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import type {
  FlowQuestion,
  IntakeAnswers,
  QuestionnaireFlow,
} from "@/lib/integrate/provider/student/chat";
import {
  AGE_MAX,
  CHILD_MAX_AGE,
  isPregnancyApplicable,
  isSnapshotMetricsValid,
  METRIC_MAX_DIGITS,
  parseIntakeAge,
  sanitizeIntakeAnswers,
  suggestSnapshotMetrics,
  validateSnapshotMetrics,
} from "@/lib/integrate/provider/student/chat/intakeDependencies";
import { cn } from "@/lib/utils";

export const INTAKE_STAGES = [
  "Provider & Consent",
  "Patient Snapshot",
  "Safety Gate",
  "Goal Selection",
  "Clinical Deep Dive",
  "History & Labs",
  "Preferences",
  "Recommendation",
] as const;

const SAFETY_FLAG_IDS = new Set(["cancer", "mtc_men2", "peptide_allergy"]);

type IntakeWizardProps = {
  flow: QuestionnaireFlow;
  step: number;
  answers: IntakeAnswers;
  onStepChange: (step: number) => void;
  onAnswersChange: (answers: IntakeAnswers) => void;
  onComplete: () => void;
  bare?: boolean;
};

type IntakeOption = { value: string; label: string };

function normalizeOptions(options: FlowQuestion["options"]): IntakeOption[] {
  return (options ?? []).map((option) =>
    typeof option === "object"
      ? { value: option.value, label: option.label }
      : { value: option, label: option },
  );
}

function goalTitle(option: IntakeOption) {
  return option.label.replace(/^[A-H]\.\s*/, "");
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
    "quiz-option-card adviser-option-card adviser-choice-card font-sans flex min-h-10 min-w-0 items-center gap-3 rounded-xl border px-3.5 text-left text-sm transition active:scale-[0.99]",
    checked
      ? "is-selected"
      : "border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] text-[color:var(--dash-muted)] hols-option-hover",
  );

/** Tap-to-select cards — primary interaction for short option lists. */
function IntakeChoiceGroup({
  label,
  required,
  value,
  onChange,
  options,
  hint,
  layout = "auto",
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: IntakeOption[];
  hint?: string;
  layout?: "auto" | "stack" | "grid";
}) {
  const columns =
    layout === "stack"
      ? "grid-cols-1"
      : layout === "grid" || options.length <= 4
        ? "grid-cols-1 @min-[28rem]:grid-cols-2"
        : "grid-cols-1";

  return (
    <fieldset className="adviser-intake-field min-w-0 space-y-2.5">
      <legend className={authLabelClass}>
        {label}
        {required ? " *" : ""}
      </legend>
      {hint ? (
        <p className="text-brand-caption -mt-1 text-[color:var(--dash-faint)]">{hint}</p>
      ) : null}
      <div className={cn("grid min-w-0 gap-2", columns)}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <button
              key={`${option.value}-${option.label}`}
              type="button"
              aria-pressed={checked}
              onClick={() => onChange(option.value)}
              className={choiceCardClass(checked)}
            >
              <OptionCheck checked={checked} />
              <span
                className={cn(
                  "min-w-0 flex-1 break-words leading-snug",
                  checked && "font-semibold text-[color:var(--dash-text)]",
                )}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const className = authLabelClass;
  if (htmlFor) {
    return (
      <label htmlFor={htmlFor} className={className}>
        {children}
      </label>
    );
  }
  return <span className={className}>{children}</span>;
}

function clipIntegerInput(raw: string, maxDigits: number, maxValue?: number) {
  let next = raw.replace(/\D/g, "").slice(0, maxDigits);
  if (maxValue != null && next !== "" && Number(next) > maxValue) {
    next = String(maxValue);
  }
  return next;
}

function IntakeSelect({
  id,
  label,
  required,
  value = "",
  onChange,
  options,
  placeholder = "Select an option",
}: {
  id: string;
  label: string;
  required?: boolean;
  value?: string;
  onChange: (value: string) => void;
  options: IntakeOption[];
  placeholder?: string;
}) {
  const hasEmptyOption = options.some((option) => option.value === "");

  return (
    <div className="adviser-intake-field grid min-w-0 gap-2">
      <label htmlFor={id} className="dashboard-field-label">
        {label}
      </label>
      <ProfileSelect
        id={id}
        label={label}
        hideLabel
        className="adviser-select gap-0"
        value={value}
        onChange={onChange}
        placeholder={hasEmptyOption ? undefined : placeholder}
        portalToBody
        menuZIndex={200}
        options={(hasEmptyOption ? options : options.filter((option) => option.value !== "")).map(
          (option) => ({
            value: option.value,
            label: option.label,
          }),
        )}
      />
    </div>
  );
}

function IntakeNumberField({
  label,
  required,
  value,
  onChange,
  maxDigits = METRIC_MAX_DIGITS,
  maxValue,
  error,
  suggestion,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  maxDigits?: number;
  maxValue?: number;
  hint?: string;
  error?: string;
  suggestion?: string;
}) {
  return (
    <label className="adviser-intake-field grid min-w-0 self-start gap-2">
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(clipIntegerInput(event.target.value, maxDigits, maxValue))}
        className={cn(
          authFieldClass,
          "adviser-field adviser-number-field h-10 min-h-10 px-3.5 text-sm",
          error && "border-[color:var(--dash-navy)]",
        )}
        aria-invalid={Boolean(error)}
        aria-required={required || undefined}
      />
      {error ? (
        <p className="text-brand-caption text-[color:var(--dash-navy)]">{error}</p>
      ) : suggestion ? (
        <p className="text-brand-caption text-[color:var(--dash-muted)]">{suggestion}</p>
      ) : null}
    </label>
  );
}

function toggleMultiselect(
  selected: string[],
  optionValue: string,
): string[] {
  const checked = selected.includes(optionValue);
  if (optionValue === "None") {
    return checked ? [] : ["None"];
  }
  const withoutNone = selected.filter((item) => item !== "None");
  if (checked) {
    return withoutNone.filter((item) => item !== optionValue);
  }
  return [...withoutNone, optionValue];
}

export function IntakeWizard({
  flow,
  step,
  answers,
  onStepChange,
  onAnswersChange,
  onComplete,
  bare = false,
}: IntakeWizardProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const branchQuestions = useMemo(() => {
    const goal = String(answers.primary_goal ?? "");
    if (!goal) return [] as FlowQuestion[];
    const branchStage = flow.stages.find((stage) => stage.id === "branch");
    return branchStage?.branches?.[goal] ?? [];
  }, [answers.primary_goal, flow.stages]);

  const updateAnswer = (id: string, value: unknown) => {
    setValidationError(null);
    const draft: IntakeAnswers = { ...answers, [id]: value };
    if (id === "primary_goal" && value && draft.secondary_goal === value) {
      draft.secondary_goal = "";
    }
    onAnswersChange(sanitizeIntakeAnswers(draft, answers));
  };

  // Keep saved / restored answers consistent (e.g. Male + pregnancy Yes).
  useEffect(() => {
    const sanitized = sanitizeIntakeAnswers(answers);
    const changed = ["pregnancy", "allergy_detail", "activity"].some(
      (key) => String(sanitized[key] ?? "") !== String(answers[key] ?? ""),
    );
    if (changed) onAnswersChange(sanitized);
    // Intentionally depend on the fields that drive auto-fill, not onAnswersChange identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.sex, answers.age, answers.pregnancy, answers.peptide_allergy, answers.activity, answers.allergy_detail]);

  const pregnancyApplies = isPregnancyApplicable(answers.sex, answers.age);
  const ageYears = parseIntakeAge(answers.age);
  const metricErrors = validateSnapshotMetrics(answers);
  const metricSuggestions = suggestSnapshotMetrics(answers);

  const metricFieldError = (key: keyof typeof metricErrors) => {
    const filled = answers[key] !== "" && answers[key] != null;
    if (filled && metricErrors[key]) return metricErrors[key];
    if (validationError && step === 1 && metricErrors[key]) return metricErrors[key];
    return undefined;
  };

  const metricFieldSuggestion = (key: keyof typeof metricSuggestions) => {
    if (metricFieldError(key)) return undefined;
    const filled = answers[key] !== "" && answers[key] != null;
    return filled ? metricSuggestions[key] : undefined;
  };

  const validateStep = () => {
    if (step === 0) return answers.consent === true;
    if (step === 1) {
      const sanitized = sanitizeIntakeAnswers(answers);
      const filled = ["age", "sex", "pregnancy", "height_cm", "weight_kg", "activity"].every(
        (key) => sanitized[key] !== "" && sanitized[key] != null,
      );
      return filled && isSnapshotMetricsValid(sanitized);
    }
    if (step === 2) {
      const required = ["cancer", "mtc_men2", "peptide_allergy", "medications"].every(
        (key) => answers[key],
      );
      const conditions = Array.isArray(answers.conditions) && answers.conditions.length > 0;
      return required && conditions;
    }
    if (step === 3) return Boolean(answers.primary_goal);
    if (step === 6) {
      return ["injection_tolerance", "complexity", "timeline"].every((key) => answers[key]);
    }
    return true;
  };

  const isStepValid = validateStep();

  const validationMessageForStep = () => {
    if (step === 0) return "Please confirm consent before continuing.";
    if (step === 1) return "Please enter a valid age, height, and weight, and complete the other snapshot fields.";
    if (step === 2) return "Please complete the safety questions, conditions, and medications before continuing.";
    if (step === 3) return "Please choose a primary goal before continuing.";
    if (step === 6) return "Please complete all preference fields before continuing.";
    return "Please complete all required fields before continuing.";
  };

  const handleNext = () => {
    if (!validateStep()) {
      setValidationError(validationMessageForStep());
      return;
    }
    setValidationError(null);
    if (step === 6) {
      onComplete();
      return;
    }
    onStepChange(step + 1);
  };

  const handleBack = () => {
    setValidationError(null);
    if (step > 0) onStepChange(step - 1);
  };

  const handleConsentContinue = () => {
    updateAnswer("consent", true);
    setValidationError(null);
    onStepChange(1);
  };

  useEffect(() => {
    setValidationError(null);
  }, [step]);

  const renderQuestion = (question: FlowQuestion) => {
    if (question.id === "pregnancy" && !pregnancyApplies) {
      return null;
    }

    if (question.show_if) {
      const visible = Object.entries(question.show_if).every(
        ([key, expected]) => answers[key] === expected,
      );
      if (!visible) return null;
    }

    if (question.id === "secondary_goal" && !answers.primary_goal) {
      return null;
    }

    const value = answers[question.id];
    let options = normalizeOptions(question.options);

    if (question.id === "activity" && ageYears != null && ageYears < CHILD_MAX_AGE) {
      options = options.filter((option) => option.value !== "Athlete");
    }

    if (question.type === "select") {
      const isGoal = question.id === "primary_goal" || question.id === "secondary_goal";
      const selectOptions = isGoal
        ? options
            .filter((option) => !option.value || option.value !== String(answers.primary_goal ?? "") || question.id === "primary_goal")
            .map((option) =>
              option.value ? { value: option.value, label: goalTitle(option) } : { value: "", label: "None" },
            )
        : options;

      return (
        <IntakeSelect
          key={question.id}
          id={`intake-${question.id}`}
          label={question.id === "secondary_goal" ? "Secondary goal" : question.text}
          required={Boolean(question.required)}
          value={String(value ?? "")}
          onChange={(next) => updateAnswer(question.id, next)}
          options={selectOptions}
          placeholder={
            question.id === "sex"
              ? "Select sex"
              : question.id === "activity"
                ? "Select activity level"
                : question.id === "primary_goal"
                  ? "Select a primary goal"
                  : question.id === "secondary_goal"
                    ? "Optional — none selected"
                    : "Select an option"
          }
        />
      );
    }

    if (question.type === "multiselect") {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const visibleOptions = options;

      return (
        <fieldset key={question.id} className="adviser-intake-field min-w-0 space-y-2.5">
          <legend className={authLabelClass}>
            <FieldLabel required={Boolean(question.required)}>{question.text}</FieldLabel>
          </legend>
          <p className="text-brand-caption -mt-1 text-[color:var(--dash-faint)]">
            Tap all that apply. Choosing “None” clears other selections.
          </p>
          <div className="grid min-w-0 gap-2 @min-[28rem]:grid-cols-2">
            {visibleOptions.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => updateAnswer(question.id, toggleMultiselect(selected, option.value))}
                  className={cn(choiceCardClass(checked), "gap-2.5 px-3 py-2.5")}
                >
                  <OptionCheck checked={checked} />
                  <span className="min-w-0 break-words leading-snug">{option.label}</span>
                </button>
              );
            })}
          </div>
          {visibleOptions.length === 0 ? (
            <p className="text-brand-caption text-[color:var(--dash-faint)]">No matching options</p>
          ) : null}
        </fieldset>
      );
    }

    if (question.type === "textarea") {
      return (
        <label key={question.id} className="adviser-intake-field grid min-w-0 gap-2">
          <span className={authLabelClass}>{question.text}</span>
          {question.id === "medications" ? (
            <p className="text-brand-caption -mt-0.5 text-[color:var(--dash-faint)]">
              Write None if the patient is not taking anything.
            </p>
          ) : null}
          <textarea
            value={String(value ?? "")}
            onChange={(event) => updateAnswer(question.id, event.target.value)}
            rows={3}
            placeholder={
              question.id === "medications"
                ? "e.g. metformin, vitamin D — or None"
                : "Type a short note…"
            }
            className={cn(authFieldClass, "adviser-field min-h-[5.5rem] resize-y px-3.5 text-sm")}
          />
        </label>
      );
    }

    if (question.type === "number") {
      const isAge = question.id === "age";
      const isHeight = question.id === "height_cm";
      const isWeight = question.id === "weight_kg";
      return (
        <IntakeNumberField
          key={question.id}
          label={question.text}
          required={Boolean(question.required)}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(next) => updateAnswer(question.id, next)}
          maxDigits={isAge || isHeight || isWeight ? METRIC_MAX_DIGITS : 4}
          maxValue={isAge ? AGE_MAX : isHeight || isWeight ? 999 : question.max}
          error={
            isAge
              ? metricFieldError("age")
              : isHeight
                ? metricFieldError("height_cm")
                : isWeight
                  ? metricFieldError("weight_kg")
                  : undefined
          }
          suggestion={
            isHeight
              ? metricFieldSuggestion("height_cm")
              : isWeight
                ? metricFieldSuggestion("weight_kg")
                : undefined
          }
        />
      );
    }

    return (
      <label key={question.id} className="adviser-intake-field grid min-w-0 self-start gap-2">
        <span className={authLabelClass}>{question.text}</span>
        <input
          type="text"
          value={String(value ?? "")}
          placeholder={
            question.id === "allergy_detail"
              ? "e.g. BPC-157, bacteriostatic water"
              : (question.placeholder ?? "Type your answer…")
          }
          onChange={(event) => updateAnswer(question.id, event.target.value)}
          className={cn(
            authFieldClass,
            "adviser-field h-10 min-h-10 px-3.5 text-sm",
            question.id === "allergy_detail" && "sm:max-w-md",
          )}
        />
      </label>
    );
  };

  const snapshotStage = flow.stages.find((stage) => stage.id === "snapshot");
  const safetyStage = flow.stages.find((stage) => stage.id === "safety");
  const goalStage = flow.stages.find((stage) => stage.id === "goal");
  const historyStage = flow.stages.find((stage) => stage.id === "history");
  const preferencesStage = flow.stages.find((stage) => stage.id === "preferences");
  const branchLabel = flow.goal_branches[String(answers.primary_goal ?? "")]?.label;
  const snapshotQuestions = snapshotStage?.questions ?? [];
  const snapshotNumberQuestions = snapshotQuestions.filter((q) => q.type === "number");
  const snapshotOtherQuestions = snapshotQuestions.filter((q) => q.type !== "number");

  const nav =
    step > 0 ? (
      <div
        className={cn(
          "adviser-intake-nav flex flex-col gap-2",
          bare
            ? "shrink-0 border-0 pt-4 @min-[22rem]:flex-row @min-[22rem]:items-center @min-[22rem]:justify-between @min-[22rem]:gap-2.5"
            : "mt-5 @min-[22rem]:mt-6 @min-[22rem]:flex-row @min-[22rem]:flex-wrap @min-[22rem]:items-center @min-[22rem]:justify-between @min-[22rem]:gap-2.5",
        )}
      >
        <button
          type="button"
          onClick={handleBack}
          className="dashboard-navy-btn lecture-page-action font-sans inline-flex h-10 min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium text-white @min-[22rem]:w-auto"
        >
          <SidebarSvgIcon name="previous" size={14} strokeWidth={2.2} />
          Back
        </button>
        <Button
          type="button"
          size="sm"
          onClick={handleNext}
          disabled={!isStepValid}
          className="lecture-page-action h-10 min-h-10 w-full overflow-hidden px-5 text-sm @min-[22rem]:w-auto @min-[22rem]:min-w-[10rem]"
        >
          {step === 6 ? "Save intake" : "Continue"}
          {step < 6 ? <SidebarSvgIcon name="next" size={14} strokeWidth={2.2} /> : null}
        </Button>
      </div>
    ) : null;

  const body = (
    <>
      <div key={step} className={cn("adviser-intake-step space-y-4", bare && "adviser-intake-step--bare")}>
        {step === 0 ? (
          <div className="space-y-4">
            <StageBlock>
              <p className="adviser-consent-copy font-sans text-sm leading-7 text-[#142644] sm:text-[0.9375rem] sm:leading-7">
                {flow.consent.text}
              </p>
              <label
                className={cn(
                  "adviser-consent-check flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition",
                  answers.consent === true
                    ? "is-checked border-[rgba(20,38,68,0.28)] bg-[rgba(20,38,68,0.04)]"
                    : "border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] hover:border-[color:var(--dash-dim)]",
                )}
              >
                <input
                  type="checkbox"
                  checked={answers.consent === true}
                  onChange={(event) => updateAnswer("consent", event.target.checked)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "adviser-consent-tick mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.35rem] border-2",
                    answers.consent === true
                      ? "border-[#142644] bg-[#142644]"
                      : "border-[rgba(21,39,68,0.34)] bg-white",
                  )}
                  style={{ color: answers.consent === true ? "#ffffff" : "transparent" }}
                  aria-hidden
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5.5 12.5 10 17l8.5-10" />
                  </svg>
                </span>
                <span className="font-sans text-sm leading-5 text-[color:var(--dash-text)]">
                  I confirm I am a licensed provider and agree to continue.
                </span>
              </label>
              <Button
                type="button"
                size="sm"
                disabled={answers.consent !== true}
                onClick={handleConsentContinue}
                className="lecture-page-action h-10 min-h-10 w-full overflow-hidden px-5 text-sm"
              >
                {flow.consent.confirm_label}
              </Button>
            </StageBlock>
          </div>
        ) : null}

        {step === 1 && snapshotStage ? (
          <StageBlock title={snapshotStage.title}>
            <div className="space-y-5">
              {snapshotNumberQuestions.length > 0 ? (
                <div className="grid grid-cols-1 items-start gap-4 @min-[28rem]:grid-cols-2">
                  {snapshotNumberQuestions.map((question) => renderQuestion(question))}
                </div>
              ) : null}
              {snapshotOtherQuestions.length > 0 ? (
                <div className="grid grid-cols-1 items-start gap-5">
                  {snapshotOtherQuestions.map((question) => renderQuestion(question))}
                </div>
              ) : null}
            </div>
          </StageBlock>
        ) : null}

        {step === 2 && safetyStage ? (
          <StageBlock title="Safety">
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                  Red flags
                </p>
                {(safetyStage.questions ?? [])
                  .filter((question) => SAFETY_FLAG_IDS.has(question.id) || question.id === "allergy_detail")
                  .map((question) => renderQuestion(question))}
              </div>
              <div className="space-y-4">
                <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                  History
                </p>
                {(safetyStage.questions ?? [])
                  .filter((question) => question.id === "conditions" || question.id === "medications")
                  .map((question) => renderQuestion(question))}
              </div>
            </div>
          </StageBlock>
        ) : null}

        {step === 3 && goalStage ? (
          <StageBlock title="Goal">
            <div className="grid items-start gap-5">
              {goalStage.questions?.map((question) => renderQuestion(question))}
            </div>
          </StageBlock>
        ) : null}

        {step === 4 ? (
          <StageBlock title={branchLabel ?? "Clinical deep dive"}>
            <div className="grid items-start gap-5">
              {branchQuestions.map((question) => renderQuestion(question))}
            </div>
          </StageBlock>
        ) : null}

        {step === 5 && historyStage ? (
          <StageBlock title={historyStage.title}>
            <div className="grid items-start gap-5">
              {historyStage.questions?.map((question) => renderQuestion(question))}
            </div>
          </StageBlock>
        ) : null}

        {step === 6 && preferencesStage ? (
          <StageBlock title={preferencesStage.title}>
            <div className="grid items-start gap-5">
              {preferencesStage.questions?.map((question) => renderQuestion(question))}
            </div>
          </StageBlock>
        ) : null}
      </div>

      {validationError ? (
        <div className="mt-5 sm:mt-6">
          <AuthAlert variant="error">{validationError}</AuthAlert>
        </div>
      ) : null}
    </>
  );

  if (bare) {
    return (
      <div className="@container flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pr-0.5">
          {body}
        </div>
        {nav}
      </div>
    );
  }

  return (
    <div className="@container dashboard-surface min-w-0 rounded-2xl p-5 md:p-6">
      {body}
      {nav}
    </div>
  );
}

function StageBlock({
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return <div className="space-y-4">{children}</div>;
}

export function IntakeStageList({
  step,
  inChat,
  orientation = "vertical",
  onStepSelect,
}: {
  step: number;
  inChat: boolean;
  orientation?: "vertical" | "horizontal" | "wrap";
  /** Jump back to a completed (or current) stage. */
  onStepSelect?: (index: number) => void;
}) {
  const renderItem = (label: string, index: number) => {
    const active = inChat ? index === 7 : index === step;
    const done = inChat ? index < 7 : index < step;
    const canJump = Boolean(onStepSelect) && !inChat && (done || active) && index < 7;

    const content = (
      <>
        <span
          className={cn(
            orientation === "vertical"
              ? "text-brand-caption flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-semibold"
              : orientation === "wrap"
                ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none"
                : "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold leading-none",
            active && "bg-[color:var(--dash-navy)] text-white",
            !active &&
              done &&
              (orientation === "vertical"
                ? "border border-[color:var(--dash-surface-border)] text-[color:var(--dash-text)]"
                : "bg-[color:var(--dash-soft)] text-[color:var(--dash-text)]"),
            !active &&
              !done &&
              (orientation === "vertical"
                ? "bg-[color:var(--dash-soft)] text-[color:var(--dash-faint)]"
                : "bg-[color:var(--dash-surface)] text-[color:var(--dash-faint)]"),
          )}
        >
          {done && !active ? (
            <SidebarSvgIcon name="check" size={orientation === "vertical" ? 12 : 10} strokeWidth={2.7} />
          ) : (
            index + 1
          )}
        </span>
        {orientation === "wrap" ? null : (
          <span
            className={cn(
              "min-w-0 leading-tight",
              orientation === "horizontal" ? "max-w-[7.5rem] truncate" : "truncate",
            )}
          >
            {label}
          </span>
        )}
      </>
    );

    const className = cn(
      "font-sans inline-flex items-center gap-1.5 rounded-lg text-left transition",
      orientation === "vertical" && "flex w-full gap-2 px-2 py-1.5 text-sm",
      orientation === "horizontal" && "h-8 min-h-9 shrink-0 rounded-full px-2.5 py-1.5 text-xs",
      orientation === "wrap" && "min-h-11 w-full justify-center px-1 text-xs",
      active && "bg-[color:var(--dash-soft)] font-semibold text-[color:var(--dash-text)] ring-1 ring-[color:var(--dash-surface-border)]",
      !active && done && "bg-[color:var(--dash-soft)] text-[color:var(--dash-muted)]",
      !active && !done && "bg-[color:var(--dash-soft)] text-[color:var(--dash-faint)]",
      canJump && "cursor-pointer hover:bg-[color:var(--dash-soft)]",
      !canJump && orientation === "vertical" && !active && !done && "opacity-70",
    );

    if (canJump) {
      return (
        <li key={label} title={label}>
          <button type="button" onClick={() => onStepSelect?.(index)} className={className}>
            {content}
          </button>
        </li>
      );
    }

    return (
      <li key={label} title={label} className={className}>
        {content}
      </li>
    );
  };

  if (orientation === "horizontal") {
    return (
      <ol className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {INTAKE_STAGES.map((label, index) => renderItem(label, index))}
      </ol>
    );
  }

  if (orientation === "wrap") {
    return (
      <ol className="grid grid-cols-4 gap-1.5">
        {INTAKE_STAGES.map((label, index) => renderItem(label, index))}
      </ol>
    );
  }

  return <ol className="space-y-1">{INTAKE_STAGES.map((label, index) => renderItem(label, index))}</ol>;
}
