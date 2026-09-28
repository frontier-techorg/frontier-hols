import type { IntakeAnswers } from "@/lib/integrate/provider/student/chat";

/** Ages where pregnancy / trying / breastfeeding is clinically N/A. */
export const PREGNANCY_MIN_AGE = 12;
export const PREGNANCY_MAX_AGE = 55;

/** Young children are not offered "Athlete" training level. */
export const CHILD_MAX_AGE = 12;

export const AGE_MIN = 1;
export const AGE_MAX = 100;
export const METRIC_MAX_DIGITS = 3;

export function parseIntakeAge(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const age = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(age)) return null;
  return Math.trunc(age);
}

export function parseIntakeNumber(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

/** Plausible height (cm) for a given age — screening bounds, not a growth chart. */
export function heightRangeForAge(age: number | null): { min: number; max: number } {
  if (age == null) return { min: 45, max: 220 };
  if (age <= 1) return { min: 50, max: 95 };
  if (age <= 3) return { min: 70, max: 110 };
  if (age <= 6) return { min: 90, max: 135 };
  if (age <= 10) return { min: 105, max: 160 };
  if (age <= 14) return { min: 125, max: 195 };
  if (age <= 17) return { min: 140, max: 210 };
  return { min: 140, max: 220 };
}

/** Plausible weight (kg). Always within 3 digits. */
export function weightRangeForAge(age: number | null): { min: number; max: number } {
  if (age == null) return { min: 4, max: 300 };
  if (age <= 1) return { min: 5, max: 18 };
  if (age <= 3) return { min: 8, max: 25 };
  if (age <= 6) return { min: 12, max: 40 };
  if (age <= 10) return { min: 16, max: 70 };
  if (age <= 14) return { min: 28, max: 110 };
  if (age <= 17) return { min: 35, max: 150 };
  return { min: 35, max: 300 };
}

function bmiFor(heightCm: number, weightKg: number) {
  const meters = heightCm / 100;
  if (meters <= 0) return null;
  return weightKg / (meters * meters);
}

export type SnapshotMetricErrors = {
  age?: string;
  height_cm?: string;
  weight_kg?: string;
};

/** Hard blockers only — missing/invalid numbers. Range outliers are suggestions. */
export function validateSnapshotMetrics(answers: IntakeAnswers): SnapshotMetricErrors {
  const errors: SnapshotMetricErrors = {};
  const age = parseIntakeAge(answers.age);
  const height = parseIntakeNumber(answers.height_cm);
  const weight = parseIntakeNumber(answers.weight_kg);

  if (answers.age === "" || answers.age == null) {
    errors.age = "Enter age (1–100).";
  } else if (age == null) {
    errors.age = "Enter a whole number for age.";
  } else if (age < AGE_MIN || age > AGE_MAX) {
    errors.age = "Age must be between 1 and 100.";
  }

  if (answers.height_cm === "" || answers.height_cm == null) {
    errors.height_cm = "Enter height in cm.";
  } else if (height == null) {
    errors.height_cm = "Enter a valid height.";
  } else if (String(Math.trunc(height)).length > METRIC_MAX_DIGITS) {
    errors.height_cm = "Height can have at most 3 digits.";
  }

  if (answers.weight_kg === "" || answers.weight_kg == null) {
    errors.weight_kg = "Enter weight in kg.";
  } else if (weight == null) {
    errors.weight_kg = "Enter a valid weight.";
  } else if (String(Math.trunc(weight)).length > METRIC_MAX_DIGITS) {
    errors.weight_kg = "Weight can have at most 3 digits.";
  }

  return errors;
}

/** Soft guidance — does not block Continue. */
export function suggestSnapshotMetrics(answers: IntakeAnswers): SnapshotMetricErrors {
  const suggestions: SnapshotMetricErrors = {};
  const age = parseIntakeAge(answers.age);
  const height = parseIntakeNumber(answers.height_cm);
  const weight = parseIntakeNumber(answers.weight_kg);
  const hard = validateSnapshotMetrics(answers);

  if (!hard.height_cm && height != null) {
    const heightRange = heightRangeForAge(age);
    if (height < heightRange.min || height > heightRange.max) {
      suggestions.height_cm =
        age != null
          ? `For age ${age}, height should be ${heightRange.min}–${heightRange.max} cm.`
          : `Height should be ${heightRange.min}–${heightRange.max} cm.`;
    }
  }

  if (!hard.weight_kg && weight != null) {
    const weightRange = weightRangeForAge(age);
    if (weight < weightRange.min || weight > weightRange.max) {
      suggestions.weight_kg =
        age != null
          ? `For age ${age}, weight should be ${weightRange.min}–${weightRange.max} kg.`
          : `Weight should be ${weightRange.min}–${weightRange.max} kg.`;
    }
  }

  if (
    !hard.height_cm &&
    !hard.weight_kg &&
    !suggestions.height_cm &&
    !suggestions.weight_kg &&
    height != null &&
    weight != null
  ) {
    const bmi = bmiFor(height, weight);
    const child = age != null && age < 18;
    const minBmi = child ? 11 : 14;
    const maxBmi = child ? 40 : 60;
    if (bmi != null && (bmi < minBmi || bmi > maxBmi)) {
      const message = "Age, height, and weight do not look consistent. Please check the values.";
      suggestions.height_cm = message;
      suggestions.weight_kg = message;
    }
  }

  return suggestions;
}

export function isSnapshotMetricsValid(answers: IntakeAnswers) {
  return Object.keys(validateSnapshotMetrics(answers)).length === 0;
}

export function normalizeSex(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Pregnancy / trying / breastfeeding only applies to non-male patients
 * in a plausible reproductive age window.
 */
export function isPregnancyApplicable(sex: unknown, age: unknown): boolean {
  if (normalizeSex(sex) === "male") return false;
  const years = parseIntakeAge(age);
  if (years != null && (years < PREGNANCY_MIN_AGE || years >= PREGNANCY_MAX_AGE)) {
    return false;
  }
  // Sex not chosen yet — keep the field visible until we know.
  if (!normalizeSex(sex)) return true;
  return true;
}

export function pregnancyAutoValue(sex: unknown, age: unknown): "N/A" | null {
  return isPregnancyApplicable(sex, age) ? null : "N/A";
}

/**
 * Keep intake answers consistent when sex / age / allergy change.
 * - Male, young child, or older patient → pregnancy forced to N/A
 * - Switching away from Male with a forced N/A → clear pregnancy so Female must answer
 * - Allergy detail cleared when allergy is not Yes
 * - Athlete activity cleared for young children
 */
export function sanitizeIntakeAnswers(
  answers: IntakeAnswers,
  previous?: IntakeAnswers,
): IntakeAnswers {
  const next: IntakeAnswers = { ...answers };
  const prev = previous ?? {};

  const sex = String(next.sex ?? "");
  const prevSex = String(prev.sex ?? "");
  const age = next.age;
  const applicable = isPregnancyApplicable(sex, age);

  if (!applicable) {
    next.pregnancy = "N/A";
  } else if (
    prevSex === "Male" &&
    sex !== "Male" &&
    String(next.pregnancy ?? "") === "N/A"
  ) {
    next.pregnancy = "";
  } else if (
    // Age moved into reproductive window from child/elder with forced N/A
    !isPregnancyApplicable(prev.sex ?? sex, prev.age) &&
    applicable &&
    String(next.pregnancy ?? "") === "N/A" &&
    sex !== "Male"
  ) {
    next.pregnancy = "";
  }

  if (String(next.peptide_allergy ?? "") !== "Yes") {
    if (next.allergy_detail != null && next.allergy_detail !== "") {
      next.allergy_detail = "";
    }
  }

  const years = parseIntakeAge(age);
  if (years != null && years < CHILD_MAX_AGE && String(next.activity ?? "") === "Athlete") {
    next.activity = "";
  }

  return next;
}

/** Snapshot keys that must be filled for stage 2 — pregnancy always present after sanitize. */
export function snapshotRequiredKeys(answers: IntakeAnswers): string[] {
  return ["age", "sex", "pregnancy", "height_cm", "weight_kg", "activity"];
}

export function isSnapshotComplete(answers: IntakeAnswers): boolean {
  const sanitized = sanitizeIntakeAnswers(answers);
  const filled = snapshotRequiredKeys(sanitized).every((key) => {
    const value = sanitized[key];
    return value !== "" && value != null;
  });
  return filled && isSnapshotMetricsValid(sanitized);
}
