import {
  SYRINGE_SIZES_ML,
  type SyringePresetMl,
  type SyringeSizeMl,
} from "@/lib/integrate/provider/student/calculator";

export const CALCULATOR_ASSETS = {
  vial: "/assets/calculator/vial.svg",
  syringe: "/assets/calculator/syringe.svg",
} as const;

/** HOLS brand palette — from brand guidelines 2026. */
export const HOLS_BRAND = {
  prussianBlue: "#142644",
  duskBlue: "#3853A4",
  lemonLime: "#DDE466",
  babyBlue: "#8DC3E1",
  charcoal: "#383838",
  white: "#FFFFFF",
  black: "#000000",
} as const;

/** Logo assets for calculator vial labels. */
export const HOLS_VIAL_BRAND = {
  mark: "https://frontiercms.s3.us-east-1.amazonaws.com/hols_logo_mark_ea0064edd1.png",
  wordmark: "https://frontiercms.s3.us-east-1.amazonaws.com/hols_logo_5c5a89997a.png",
} as const;

/** Visual scale for each syringe capacity — balanced for overview + draw-scene fit. */
export const SYRINGE_IMAGE_SCALE: Record<SyringePresetMl, number> = {
  0.25: 0.58,
  0.5: 0.68,
  1: 0.8,
  2: 0.9,
  3: 0.98,
};

/**
 * Rendered width (in rem) of the horizontal syringe SVG, per syringe capacity.
 * Chosen with a *dramatic* spread so users can clearly see the syringe grow
 * when they pick a larger size on the "Syringe" step. Used in BOTH overview
 * (selection) and draw (animation) modes so the animation reads at the same
 * scale users just saw.
 */
export const SYRINGE_DISPLAY_WIDTH_REM: Record<SyringePresetMl, number> = {
  0.25: 15,
  0.5: 17,
  1: 20,
  2: 22.5,
  3: 25,
};

/**
 * Narrow-viewport widths — keep the same relative scale as desktop so insert
 * depth, needle length, and vial size stay proportional (not crushed for SE).
 */
export const SYRINGE_DISPLAY_WIDTH_REM_COMPACT: Record<SyringePresetMl, number> = {
  0.25: 8.75,
  0.5: 9.75,
  1: 11,
  2: 12,
  3: 13,
};

function interpolatePresetTable(
  ml: number,
  table: Record<SyringePresetMl, number>,
  fallback: number,
): number {
  const value = Number.isFinite(ml) && ml > 0 ? ml : 1;
  const presets = SYRINGE_SIZES_ML;
  const first = presets[0];
  const last = presets[presets.length - 1];
  if (value <= first) return table[first] ?? fallback;
  if (value >= last) return table[last] ?? fallback;
  for (let i = 0; i < presets.length - 1; i++) {
    const left = presets[i];
    const right = presets[i + 1];
    if (value <= right) {
      const span = right - left;
      const t = span === 0 ? 0 : (value - left) / span;
      return table[left] + (table[right] - table[left]) * t;
    }
  }
  return fallback;
}

export function syringeImageScaleForMl(syringeMl: SyringeSizeMl): number {
  return interpolatePresetTable(syringeMl, SYRINGE_IMAGE_SCALE, 0.8);
}

export function syringeDisplayWidthRem(
  syringeMl: SyringeSizeMl,
  compact = false,
): number {
  const table = compact ? SYRINGE_DISPLAY_WIDTH_REM_COMPACT : SYRINGE_DISPLAY_WIDTH_REM;
  return interpolatePresetTable(syringeMl, table, compact ? 8.25 : 20);
}

/** Largest capacity — used to reserve a fixed overview/draw layout slot. */
export const SYRINGE_LAYOUT_ML: SyringeSizeMl = 3;

/**
 * Shared syringe scale for overview (measurement) and draw (animation).
 * Keep both call sites on this helper so the graphic never changes size
 * between those steps.
 */
export function syringeDrawImageScale(
  syringeMl: SyringeSizeMl,
  compact = false,
): number {
  const rawScale = syringeImageScaleForMl(syringeMl);
  if (compact) {
    return Math.min(Math.max(rawScale * 0.92, 0.68), 0.92);
  }
  return Math.min(Math.max(rawScale, 0.78), 1.05);
}

/** Rendered SVG height (px) for draw-mode AssetSyringe. */
export function syringeDrawBaseHeightPx(compact = false): number {
  return compact ? 260 : 340;
}

/**
 * Vertical padding above the vials — sized for the *largest* syringe so the
 * animation card height does not jump when the user picks a different size.
 */
export function syringeDrawScenePaddingPx(
  _syringeMl: SyringeSizeMl,
  compact = false,
): number {
  const scale = syringeDrawImageScale(SYRINGE_LAYOUT_ML, compact);
  const heightPx = syringeDrawBaseHeightPx(compact) * scale;
  // tipY 456 → thumbTop -142 in a viewBox from -146..466 → 598 / 612
  const tipToThumbPx = heightPx * (598 / 612);
  const breath = compact ? 10 : 28;
  return Math.ceil(tipToThumbPx * (compact ? 1.04 : 1.06) + breath);
}
