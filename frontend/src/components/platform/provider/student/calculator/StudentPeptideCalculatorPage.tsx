"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { Button } from "@/components/ui/Button";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { CalculatorPageSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { CalculatorPageLayout } from "@/components/platform/provider/student/calculator/CalculatorPageLayout";
import { CalculatorVisual } from "@/components/platform/provider/student/calculator/CalculatorVisual";
import { InjectionAnimation } from "@/components/platform/provider/student/calculator/InjectionAnimation";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { gsap, registerGsap } from "@/lib/gsap";
import { prefersReducedMotion } from "@/lib/motion";
import {
  SYRINGE_SIZES_ML,
  calculatePeptideDose,
  type MassUnit,
  type PeptideCalculatorResult,
  type SyringePresetMl,
} from "@/lib/integrate/provider/student/calculator";
import { cn } from "@/lib/utils";

type Step = "syringe" | "peptide" | "water" | "dose" | "animating" | "result";

const calcCardClass =
  "dashboard-glass-card flex min-w-0 max-w-full flex-col rounded-2xl p-3 sm:p-4";

const PROGRESS_STEPS: Array<{
  id: Exclude<Step, "animating" | "result">;
  label: string;
}> = [
  { id: "syringe", label: "Syringe" },
  { id: "peptide", label: "Medication" },
  { id: "water", label: "Water" },
  { id: "dose", label: "Dose" },
];

function isAmountDraft(raw: string): boolean {
  return raw === "" || /^\d*\.?\d*$/.test(raw);
}

function parseSyringePreset(raw: string): SyringePresetMl {
  const value = Number(raw);
  return (SYRINGE_SIZES_ML as readonly number[]).includes(value) ? (value as SyringePresetMl) : 1;
}

export function StudentPeptideCalculatorPage({
  embedded = false,
}: {
  embedded?: boolean;
  /** @deprecated Hero removed — kept optional for call-site compatibility. */
  hideHero?: boolean;
} = {}) {
  const [ready, setReady] = useState(embedded);
  const [step, setStep] = useState<Step>("syringe");
  const [syringeMl, setSyringeMl] = useState<SyringePresetMl>(1);
  const [peptideAmount, setPeptideAmount] = useState("");
  const [peptideUnit, setPeptideUnit] = useState<MassUnit>("mg");
  const [waterMl, setWaterMl] = useState("");
  const [doseAmount, setDoseAmount] = useState("");
  const [doseUnit, setDoseUnit] = useState<MassUnit>("mcg");
  const [result, setResult] = useState<PeptideCalculatorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingResultRef = useRef<PeptideCalculatorResult | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unitsRef = useRef<HTMLSpanElement>(null);
  const dosesRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (embedded) return;
    setReady(true);
  }, [embedded]);

  const progressIndex =
    step === "animating" || step === "result"
      ? PROGRESS_STEPS.length - 1
      : PROGRESS_STEPS.findIndex((s) => s.id === step);

  const visualMode = useMemo(() => {
    if (step === "result") return "result" as const;
    if (step === "animating") return "dose" as const;
    return step;
  }, [step]);

  const finishAnimation = useCallback(() => {
    const pending = pendingResultRef.current;
    if (!pending) return;
    setResult(pending);
    pendingResultRef.current = null;
    setStep("result");
  }, []);

  useGSAP(
    () => {
      registerGsap();
      if (!panelRef.current) return;
      gsap.set(panelRef.current, { autoAlpha: 1, y: 0 });
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        panelRef.current,
        { y: 12 },
        { y: 0, duration: 0.35, ease: "power2.out", clearProps: "transform" },
      );
    },
    { dependencies: [step] },
  );

  useEffect(() => {
    if (step !== "result" || !result || prefersReducedMotion()) return;
    registerGsap();
    const units = { value: 0 };
    const doses = { value: 0 };
    if (unitsRef.current) {
      gsap.to(units, {
        value: result.unitsPerDose,
        duration: 1,
        ease: "power2.out",
        onUpdate: () => {
          if (unitsRef.current) unitsRef.current.textContent = units.value.toFixed(2);
        },
      });
    }
    if (dosesRef.current) {
      gsap.to(doses, {
        value: result.totalDoses,
        duration: 1,
        delay: 0.1,
        ease: "power2.out",
        onUpdate: () => {
          if (dosesRef.current) dosesRef.current.textContent = doses.value.toFixed(2);
        },
      });
    }
  }, [result, step]);

  function goBack() {
    setError(null);
    if (step === "animating") return;
    const index = PROGRESS_STEPS.findIndex((s) => s.id === step);
    if (index <= 0) return;
    setStep(PROGRESS_STEPS[index - 1].id);
    setResult(null);
    pendingResultRef.current = null;
  }

  function restart() {
    setStep("syringe");
    setSyringeMl(1);
    setPeptideAmount("5");
    setPeptideUnit("mg");
    setWaterMl("2");
    setDoseAmount("250");
    setDoseUnit("mcg");
    setResult(null);
    pendingResultRef.current = null;
    setError(null);
  }

  function validatePositive(value: string, label: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Enter a valid ${label} greater than zero.`);
    }
    return parsed;
  }

  function goNext() {
    setError(null);
    try {
      if (step === "syringe") {
        setStep("peptide");
        return;
      }
      if (step === "peptide") {
        validatePositive(peptideAmount, "peptide amount");
        setStep("water");
        return;
      }
      if (step === "water") {
        validatePositive(waterMl, "water volume");
        setStep("dose");
        return;
      }
      if (step === "dose") {
        const peptide = validatePositive(peptideAmount, "peptide amount");
        const water = validatePositive(waterMl, "water volume");
        const dose = validatePositive(doseAmount, "desired dose");
        const computed = calculatePeptideDose({
          syringeMl,
          peptideAmount: peptide,
          peptideUnit,
          waterMl: water,
          doseAmount: dose,
          doseUnit,
        });
        pendingResultRef.current = computed;
        setStep("animating");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue.");
    }
  }


  const content = !ready ? (
    <CalculatorPageSkeleton />
  ) : (
    <>
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

      <div className="grid min-w-0 max-w-full gap-3 sm:gap-4">
        <CalculatorStepper progressIndex={progressIndex} step={step} />

        <div
          ref={panelRef}
          className={cn(
            "mt-3 min-w-0 max-[390px]:mt-2.5 sm:mt-4",
            step === "animating"
              ? "mx-auto w-full"
              : "grid items-start gap-3 max-[390px]:gap-2.5 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:gap-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]",
          )}
        >
          {step === "animating" ? (
            <InjectionAnimation
              onComplete={finishAnimation}
              syringeMl={syringeMl}
              peptideUnit={peptideUnit}
              waterMl={Number(waterMl) || 1}
              peptideAmount={Number(peptideAmount) || 10}
            />
          ) : (
          <>
          <div className="order-1 flex min-h-0 min-w-0 flex-col">
            {step === "syringe" ? (
              <StepPanel
                title="Syringe size"
                actions={
                  <StepActions
                    onBack={goBack}
                    onNext={goNext}
                    backDisabled
                    nextLabel="Next"
                  />
                }
              >
                <ProfileSelect
                  id="calculator-syringe"
                  label="Syringe size"
                  hideLabel
                  value={String(syringeMl)}
                  onChange={(value) => setSyringeMl(parseSyringePreset(value))}
                  options={SYRINGE_SIZES_ML.map((size) => ({
                    value: String(size),
                    label: `${size} ml`,
                  }))}
                />
              </StepPanel>
            ) : null}

            {step === "peptide" ? (
              <StepPanel
                title="Medication"
                actions={
                  <StepActions onBack={goBack} onNext={goNext} nextLabel="Next" />
                }
              >
                <AmountRow
                  id="calculator-peptide-unit"
                  value={peptideAmount}
                  onValueChange={setPeptideAmount}
                  unit={peptideUnit}
                  onUnitChange={setPeptideUnit}
                  units={["g", "mg", "mcg"]}
                />
              </StepPanel>
            ) : null}

            {step === "water" ? (
              <StepPanel
                title="Water"
                actions={
                  <StepActions onBack={goBack} onNext={goNext} nextLabel="Next" />
                }
              >
                <AmountRow
                  id="calculator-water-unit"
                  value={waterMl}
                  onValueChange={setWaterMl}
                  unit="ml"
                  units={["ml"]}
                />
              </StepPanel>
            ) : null}

            {step === "dose" ? (
              <StepPanel
                title="Dose"
                actions={
                  <StepActions onBack={goBack} onNext={goNext} nextLabel="Calculate" />
                }
              >
                <AmountRow
                  id="calculator-dose-unit"
                  value={doseAmount}
                  onValueChange={setDoseAmount}
                  unit={doseUnit}
                  onUnitChange={setDoseUnit}
                  units={["mcg", "mg"]}
                />
              </StepPanel>
            ) : null}

            {step === "result" && result ? (
              <div className={cn(calcCardClass, "calc-step-card overflow-hidden text-left")}>
                <h2 className="font-sans text-pretty text-base font-semibold leading-[1.15] tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl">
                  Results
                </h2>
                <div className="calc-result-grid mt-4 grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 sm:mt-5 sm:gap-x-5">
                  <p className="calc-result-label text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                    Units per dose
                  </p>
                  <p className="calc-result-label text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                    Total doses in vial
                  </p>
                  <p className="calc-result-value font-sans text-2xl font-bold tracking-tight text-[color:var(--dash-text)] sm:text-[1.75rem]">
                    <span ref={unitsRef}>{result.unitsPerDose.toFixed(2)}</span>
                  </p>
                  <p className="calc-result-value font-sans text-2xl font-bold tracking-tight text-[color:var(--dash-text)] sm:text-[1.75rem]">
                    <span ref={dosesRef}>{result.totalDoses.toFixed(2)}</span>
                  </p>
                </div>
                <p className="text-brand-body mt-4 min-w-0 text-xs leading-relaxed break-words text-[color:var(--dash-muted)] sm:mt-5 sm:text-sm">
                  Draw to {result.unitsPerDose.toFixed(2)} units ({result.doseVolumeMl} ml) on your{" "}
                  {syringeMl} ml syringe.
                </p>
                <Button
                  type="button"
                  onClick={restart}
                  className="lecture-page-action mt-5 w-full px-5 sm:mt-6"
                >
                  Restart
                </Button>
              </div>
            ) : null}
          </div>

          <div className="order-2 flex min-w-0">
            <div className="flex w-full min-w-0 md:sticky md:top-4 md:self-start">
              <CalculatorVisual
                mode={visualMode}
                syringeMl={syringeMl}
                unitsPerDose={result?.unitsPerDose ?? 0}
                maxUnits={result?.maxUnitsOnSyringe ?? syringeMl * 100}
                waterFilled={step === "water" || step === "dose" || step === "result"}
                medicationFilled={step === "result"}
                peptideUnit={peptideUnit}
                waterMl={waterMl}
                peptideAmount={peptideAmount}
              />
            </div>
          </div>
          </>
          )}
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <div className="calculator-page grid w-full min-w-0 max-w-full gap-3 overflow-visible sm:gap-4">{content}</div>;
  }

  return <CalculatorPageLayout>{content}</CalculatorPageLayout>;
}

function CalculatorStepper({
  progressIndex,
  step,
}: {
  progressIndex: number;
  step: Step;
}) {
  return (
    <nav aria-label="Calculator steps" className="calc-stepper mx-auto w-full min-w-0 px-0.5 sm:px-2 md:max-w-2xl md:px-1">
      <ol className="relative m-0 flex list-none items-start justify-between gap-0 p-0">
        {PROGRESS_STEPS.map((item, index) => {
          const done = progressIndex > index || step === "result";
          const active =
            progressIndex === index && step !== "animating" && step !== "result";
          const pending = !done && !active;
          const connectorDone = progressIndex > index || step === "result";

          return (
            <li
              key={item.id}
              className="relative isolate flex min-w-0 flex-1 flex-col items-center text-center"
            >
              {index < PROGRESS_STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute z-0 h-[2px] top-[0.8rem] left-[calc(50%+1.15rem)] right-[calc(-50%+1.15rem)] sm:top-[0.95rem] sm:left-[calc(50%+1.35rem)] sm:right-[calc(-50%+1.35rem)]",
                    connectorDone ? "bg-[#C5D63A]" : "bg-[color:var(--dash-surface-border)]",
                  )}
                />
              ) : null}

              <span
                className={cn(
                  "relative z-10 flex h-7 w-7 items-center justify-center rounded-full sm:h-8 sm:w-8",
                  done && "bg-[#C5D63A] text-[#152744] ring-2 ring-[#142644]",
                  active && "bg-[#C5D63A] ring-2 ring-[#142644]",
                  pending && "calc-step-node--pending border border-[color:var(--dash-surface-border)] bg-white",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? (
                  <SidebarSvgIcon name="check" size={14} strokeWidth={2.6} className="text-[#152744]" />
                ) : (
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5",
                      active ? "bg-[#142644]" : "bg-[color:var(--dash-muted)]",
                    )}
                  />
                )}
              </span>

              <p
                className={cn(
                  "font-sans mt-2 w-full truncate px-0.5 text-[11px] font-semibold leading-tight tracking-[0.01em] sm:mt-2.5 sm:px-1 sm:text-sm",
                  active
                    ? "font-bold text-[#142644]"
                    : "text-[color:var(--dash-text)]",
                )}
              >
                {item.label}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepPanel({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className={cn(calcCardClass, "gap-3")}>
      <h2 className="font-sans text-base font-semibold leading-tight tracking-[0.01em] text-[color:var(--dash-text)]">
        {title}
      </h2>
      <div className="w-full min-w-0">{children}</div>
      {actions}
    </div>
  );
}

function StepActions({
  onBack,
  onNext,
  backDisabled = false,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  backDisabled?: boolean;
  nextLabel: string;
}) {
  const showBack = !backDisabled;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5",
        showBack ? "sm:justify-between" : "sm:justify-end",
      )}
    >
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white sm:w-auto"
        >
          <SidebarSvgIcon name="previous" size={16} />
          Back
        </button>
      ) : null}
      <Button type="button" onClick={onNext} className="lecture-page-action w-full px-5 sm:w-auto">
        {nextLabel}
        {nextLabel !== "Calculate" ? <SidebarSvgIcon name="next" size={16} /> : null}
      </Button>
    </div>
  );
}

function AmountRow({
  id,
  value,
  onValueChange,
  unit,
  onUnitChange,
  units,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  unit: string;
  onUnitChange?: (unit: MassUnit) => void;
  units: string[];
}) {
  function handleChange(raw: string) {
    if (!isAmountDraft(raw)) return;
    onValueChange(raw);
  }

  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_6.75rem] items-end gap-2">
      <div className="grid min-w-0 gap-2">
        <label htmlFor={`${id}-amount`} className="dashboard-field-label">
          Amount
        </label>
        <input
          id={`${id}-amount`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder="Amount"
          onChange={(event) => handleChange(event.target.value)}
          className="dashboard-field [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <ProfileSelect
        id={id}
        label="Unit"
        value={unit}
        onChange={(next) => {
          if (onUnitChange && (next === "g" || next === "mg" || next === "mcg")) onUnitChange(next);
        }}
        options={units.map((option) => ({ value: option, label: option }))}
      />
    </div>
  );
}
