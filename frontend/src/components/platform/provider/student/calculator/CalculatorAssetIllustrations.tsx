"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { useGSAP } from "@gsap/react";
import {
  HOLS_BRAND,
  SYRINGE_LAYOUT_ML,
  syringeDrawBaseHeightPx,
  syringeDrawImageScale,
  syringeImageScaleForMl,
} from "@/components/platform/provider/student/calculator/calculatorAssets";
import {
  SYRINGE_BARREL_TRAVEL,
  syringeLiquidLayout,
} from "@/components/platform/provider/student/calculator/calculatorGeometry";
import {
  BAC_WATER_SRC,
  BacWaterLiquidFill,
  BacWaterVialArt,
  bacWaterLiquidOffsetY,
} from "@/components/platform/provider/student/calculator/BacWaterVialArt";
import {
  HEXARELIN_SRC,
  HexarelinLiquidFill,
  HexarelinPowderCake,
  HexarelinVialArt,
} from "@/components/platform/provider/student/calculator/HexarelinVialArt";
import {
  SYRINGE_ART,
  SyringeArt,
} from "@/components/platform/provider/student/calculator/SyringeArt";
import { useCompactCalculatorScene } from "@/components/platform/provider/student/calculator/useCompactCalculatorScene";
import { gsap, registerGsap } from "@/lib/gsap";
import type { MassUnit, SyringeSizeMl } from "@/lib/integrate/provider/student/calculator";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Colour palettes                                                            */
/* -------------------------------------------------------------------------- */

type LiquidPalette = {
  top: string;
  bottom: string;
  edge: string;
  powder: string;
  cap: string;
  capDark: string;
  glow: string;
};

function peptidePalette(_unit: MassUnit = "mg"): LiquidPalette {
  // Reconstituted peptide reads as a clear, faintly cloudy clinical liquid —
  // pale blue-white with a soft meniscus. The dry lyophilized cake stays
  // white (see `powder`) so the two states are visually distinct.
  return {
    top: "#eef6fb",
    bottom: "#c9def0",
    edge: "#8fb4d3",
    powder: "#ffffff",
    cap: HOLS_BRAND.prussianBlue,
    capDark: "#0a1424",
    glow: "transparent",
  };
}

const WATER_PALETTE: LiquidPalette = {
  top: "#f0f9fc",
  bottom: HOLS_BRAND.babyBlue,
  edge: HOLS_BRAND.duskBlue,
  powder: "#f0f9fc",
  cap: "#e23d8a",
  capDark: "#b01560",
  glow: "transparent",
};

/* -------------------------------------------------------------------------- */
/*  Vial                                                                       */
/* -------------------------------------------------------------------------- */

type AssetVialProps = {
  label: string;
  fillRatio?: number;
  variant?: "water" | "peptide";
  peptideUnit?: MassUnit;
  powder?: boolean;
  empty?: boolean;
  mini?: boolean;
  active?: boolean;
  showGlow?: boolean;
  instantFill?: boolean;
  /** When true, fill motion is driven by GSAP — React must not set layer transforms. */
  gsapDriven?: boolean;
  /** Split render for draw animation depth — back (contents), front (glass + label), or full. */
  renderLayer?: "full" | "back" | "front";
  className?: string;
};

// Vial glass interior bounds (viewBox 0 0 120 205).
export const VIAL_INTERIOR_TOP = 76;
export const VIAL_INTERIOR_HEIGHT = 95;
export const VIAL_CX = 60;
export const VIAL_LABEL_X = 28;
export const VIAL_LABEL_WIDTH = 64;
export const VIAL_LABEL_TOP = 88;
export const VIAL_LABEL_HEIGHT = 72;

export function AssetVial({
  label,
  fillRatio = 0.75,
  variant = "water",
  peptideUnit = "mg",
  powder = false,
  empty = false,
  mini = false,
  active: _active = false,
  showGlow: _showGlow = false,
  instantFill = false,
  gsapDriven = false,
  renderLayer = "full",
  className,
}: AssetVialProps) {
  const showBack = renderLayer === "full" || renderLayer === "back";
  const showFront = renderLayer === "full" || renderLayer === "front";
  const frontGlass = renderLayer === "front";
  const uid = useId().replace(/:/g, "");
  const palette = variant === "water" ? WATER_PALETTE : peptidePalette(peptideUnit);

  const isEmpty = empty || fillRatio <= 0.02;
  const isWater = variant === "water";
  const showPowder = variant === "peptide" && powder && !isEmpty;
  const clamped = isEmpty ? 0 : Math.min(0.95, Math.max(0.06, fillRatio));
  const interiorHeight =
    variant === "water" ? BAC_WATER_SRC.interiorHeight : HEXARELIN_SRC.interiorHeight;
  // Powder height is drawn into the cake itself — never use liquid translate offsets.
  // Bac-water meniscus stays in the clear glass under the label so level changes read.
  const targetOffsetY = showPowder
    ? 0
    : isWater
      ? bacWaterLiquidOffsetY(clamped, isEmpty)
      : isEmpty
        ? interiorHeight - 6
        : (1 - clamped) * interiorHeight;
  const waterEmpty = variant === "water" && isEmpty;
  const productName = variant === "water" ? "Bacteriostatic water" : "Medication vial";

  const rootRef = useRef<HTMLDivElement>(null);
  const fillProxy = useRef({ y: targetOffsetY });
  const liquidLayerRef = useRef<SVGGElement>(null);
  const surfaceRef = useRef<SVGCircleElement>(null);

  /** Smooth fill in SVG user units — CSS px transforms fight the scaled vial art. */
  useGSAP(
    () => {
      registerGsap();
      if (gsapDriven || showPowder) return;

      const apply = (y: number) => {
        liquidLayerRef.current?.setAttribute("transform", `translate(0 ${y})`);
        surfaceRef.current?.setAttribute("transform", `translate(0 ${y})`);
      };

      if (instantFill) {
        fillProxy.current.y = targetOffsetY;
        apply(targetOffsetY);
        return;
      }

      gsap.to(fillProxy.current, {
        y: targetOffsetY,
        duration: 0.7,
        ease: "power2.inOut",
        overwrite: "auto",
        onUpdate: () => apply(fillProxy.current.y),
      });
    },
    {
      scope: rootRef,
      dependencies: [targetOffsetY, gsapDriven, showPowder, instantFill, uid],
    },
  );

  useLayoutEffect(() => {
    if (gsapDriven || showPowder) return;
    fillProxy.current.y = targetOffsetY;
    liquidLayerRef.current?.setAttribute("transform", `translate(0 ${targetOffsetY})`);
    surfaceRef.current?.setAttribute("transform", `translate(0 ${targetOffsetY})`);
    // Initial paint only — subsequent motion is GSAP-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, gsapDriven, showPowder]);

  return (
    <div
      ref={rootRef}
      // Width comes from the caller (`w-full` in draw columns, fixed rem
      // sizes in overview). Do not set `w-full` here — `cn` does not
      // tailwind-merge, so a base `w-full` would fight overview size classes
      // and both vials would stretch equal-width (med then looks taller).
      className={cn("flex shrink-0 flex-col items-center justify-end", className)}
    >
      <div className="relative w-full">
        <div
          className={cn(
            "relative mx-auto w-full shrink-0",
            mini ? "max-w-[2.6rem] sm:max-w-12" : "max-w-none",
          )}
          style={
            mini
              ? undefined
              : { aspectRatio: isWater ? "160 / 210" : "120 / 205" }
          }
        >
          <svg
            viewBox={isWater ? "0 0 160 210" : "0 0 120 205"}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMax meet"
            className={cn(
              "calc-vial-art overflow-visible",
              mini ? "h-24 w-full sm:h-28" : "absolute inset-0 h-full w-full",
            )}
            role="img"
            aria-hidden
          >
            {isWater ? (
              <BacWaterVialArt
                uid={uid}
                showBack={showBack}
                showFront={showFront}
                frontGlass={frontGlass}
                empty={isEmpty}
                gsapDriven={gsapDriven}
                fillOffsetY={targetOffsetY}
                liquidLayerRef={liquidLayerRef}
                surfaceRef={surfaceRef}
                liquidLayer={<BacWaterLiquidFill />}
              />
            ) : (
              <HexarelinVialArt
                uid={uid}
                productName={productName}
                theme="navy"
                showBack={showBack}
                showFront={showFront}
                frontGlass={frontGlass}
                powder={showPowder}
                empty={isEmpty}
                gsapDriven={gsapDriven}
                fillOffsetY={targetOffsetY}
                liquidLayerRef={liquidLayerRef}
                surfaceRef={surfaceRef}
                liquidLayer={
                  <HexarelinLiquidFill
                    paletteTop={palette.top}
                    paletteBottom={palette.bottom}
                    paletteEdge={palette.edge}
                  />
                }
                powderLayer={<HexarelinPowderCake fillRatio={clamped || 0.2} />}
              />
            )}
          </svg>
        </div>
      </div>
      {label ? (
        <p
          className={cn(
            "mt-1.5 flex min-h-6 w-full items-end justify-center px-0.5 text-center text-[8px] font-semibold uppercase leading-tight tracking-[0.04em] max-[390px]:min-h-5 max-[390px]:text-[7px] sm:mt-2 sm:min-h-9 sm:text-[10px] sm:tracking-[0.12em]",
            waterEmpty
              ? "text-[color:var(--dash-muted)]"
              : "text-[color:var(--dash-text)]",
          )}
        >
          {label}
        </p>
      ) : null}
    </div>
  );

}

/* -------------------------------------------------------------------------- */
/*  Syringe                                                                    */
/* -------------------------------------------------------------------------- */

type AssetSyringeProps = {
  syringeMl?: SyringeSizeMl;
  fillRatio?: number;
  label?: string;
  active?: boolean;
  compact?: boolean;
  large?: boolean;
  horizontal?: boolean;
  showFill?: boolean;
  instantFill?: boolean;
  /** When true, fill motion is driven by GSAP — React must not set layer transforms. */
  gsapDriven?: boolean;
  /** Split render for draw depth compositing — needle behind vial glass, barrel in front. */
  part?: "full" | "needle" | "barrel";
  vertical?: boolean;
  needleDown?: boolean;
  className?: string;
};

// Re-export for any legacy imports.
export const SYRINGE_TRAVEL = SYRINGE_BARREL_TRAVEL;

export function AssetSyringe({
  syringeMl = 1,
  fillRatio = 0.35,
  label,
  active = false,
  compact = false,
  large = false,
  horizontal = false,
  showFill = true,
  instantFill = false,
  gsapDriven = false,
  part = "full",
  vertical = false,
  needleDown = false,
  className,
}: AssetSyringeProps) {
  const uid = useId().replace(/:/g, "");
  const narrowViewport = useCompactCalculatorScene();
  const useCompactScale = compact || narrowViewport;
  const rawScale = syringeImageScaleForMl(syringeMl);
  const layoutScaleRaw = syringeImageScaleForMl(SYRINGE_LAYOUT_ML);
  // Overview (horizontal) and draw (needleDown) share one size so measurement
  // matches the reconstitution animation.
  const matchDrawSize = needleDown || horizontal;
  const scale = matchDrawSize
    ? syringeDrawImageScale(syringeMl, useCompactScale)
    : rawScale * 1.12;
  const layoutScale = matchDrawSize
    ? syringeDrawImageScale(SYRINGE_LAYOUT_ML, useCompactScale)
    : layoutScaleRaw * 1.12;

  const clamped = Math.min(0.98, Math.max(0, showFill ? fillRatio : 0));

  /** Empty → plunger pushed in (thumb kept back by stem gap); full → plunger pulled out above barrel. */
  const plungerY = (1 - clamped) * SYRINGE_BARREL_TRAVEL;
  /**
   * When GSAP drives the draw scene, React seeds empty geometry once; later
   * renders must not rewrite transform / y / height / CSS opacity (CSS opacity
   * would beat SVG attribute opacity that GSAP sets during the draw).
   */
  const plungerTransform = gsapDriven
    ? `translate(0 ${SYRINGE_BARREL_TRAVEL})`
    : `translate(0 ${plungerY})`;
  const liquid = gsapDriven ? syringeLiquidLayout(0) : syringeLiquidLayout(clamped);
  const showLiquid = showFill && (clamped > 0 || gsapDriven) && part !== "needle";

  /** Use SVG transform only — avoid stacking CSS + SVG transforms. */
  const plungerMotionStyle = { willChange: "transform" as const };

  /** Never set CSS opacity when GSAP-driven — attribute opacity is used instead. */
  const liquidLayerStyle = gsapDriven ? ({ willChange: "opacity" } as const) : undefined;
  const liquidLayerOpacity = gsapDriven ? 0 : undefined;

  const showNeedle = part === "full" || part === "needle";
  const showBarrel = part === "full" || part === "barrel";

  const baseHeight = matchDrawSize
    ? syringeDrawBaseHeightPx(useCompactScale)
    : large
      ? 320
      : useCompactScale
        ? 180
        : 280;
  const height = Math.round(baseHeight * scale);
  const layoutHeight = Math.round(baseHeight * layoutScale);
  const viewTop = SYRINGE_ART.viewTop;
  // Always include the full cannula — overview used to clip at 380 and hide length.
  const viewBottom = SYRINGE_ART.viewBottom;
  const viewH = viewBottom - viewTop;
  const width = Math.round(height * (92 / viewH));
  const layoutWidth = Math.round(layoutHeight * (92 / viewH));
  const needleTipY = SYRINGE_ART.tipY;

  /**
   * Overview: flat horizontal (−90°, needle right).
   * Draw (gsapDriven): same horizontal park until GSAP measures at 0° then
   * restores −90° for the intro.
   */
  const rotate = horizontal || (needleDown && gsapDriven) ? -90 : 0;

  const rad = (Math.abs(rotate) * Math.PI) / 180;
  const boxW = Math.round(Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad)));
  const boxH = Math.round(Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad)));
  const slotW = Math.round(
    Math.abs(layoutWidth * Math.cos(rad)) + Math.abs(layoutHeight * Math.sin(rad)),
  );
  const slotH = Math.round(
    Math.abs(layoutWidth * Math.sin(rad)) + Math.abs(layoutHeight * Math.cos(rad)),
  );

  /** Tip as fraction of the SVG box (inside the rotator so it tracks GSAP rotation). */
  const tipTopPct = ((needleTipY - viewTop) / viewH) * 100;

  // Overview: fixed slot (largest syringe). Draw: natural bounds for GSAP measure.
  const frameW = horizontal ? slotW : Math.max(boxW, width);
  const frameH = horizontal ? slotH : Math.max(boxH, height);

  const svg = (
    <svg
      viewBox={`-6 ${viewTop} 92 ${viewH}`}
      width={width}
      height={height}
      className="calc-syringe-art overflow-visible"
      role="img"
      aria-hidden
    >
      <SyringeArt
        uid={`${uid}-${part}`}
        showNeedle={showNeedle}
        showBarrel={showBarrel}
        showLiquid={showLiquid}
        active={active && showBarrel}
        needleDown={needleDown}
        plungerTransform={plungerTransform}
        plungerMotionStyle={plungerMotionStyle}
        liquidLayerStyle={liquidLayerStyle}
        liquidLayerOpacity={liquidLayerOpacity}
        liquidFill={liquid}
        gsapOwned={gsapDriven && showBarrel}
      />
    </svg>
  );

  return (
    <div
      className={cn(
        "flex max-w-full flex-col items-center",
        // Keep the rotated barrel fully visible. A hidden frame cut the
        // overview syringe off behind the top of the card.
        "overflow-visible",
        className,
      )}
      data-syringe-box={needleDown ? "draw" : undefined}
    >
      <div
        className={cn(
          "relative flex max-w-full items-center justify-center overflow-visible",
        )}
        style={{ width: frameW, height: horizontal ? frameH + 16 : frameH, maxWidth: "100%" }}
      >
        <div
          data-syringe-rotator
          className="absolute left-1/2 top-1/2 flex items-center justify-center overflow-visible"
          style={{
            width,
            height,
            transformOrigin: "center center",
            // When GSAP owns the draw scene, do NOT put transform in React style —
            // status re-renders would clobber the animated rotation. Seed via ref.
            ...(gsapDriven
              ? {}
              : { transform: `translate(-50%, -50%) rotate(${rotate}deg)` }),
          }}
          ref={(node) => {
            if (!node || !gsapDriven) return;
            if (!node.style.transform) {
              // Park horizontal (−90°) until InjectionAnimation measures at 0°
              // then restores horizontal for the intro.
              node.style.transform = `translate(-50%, -50%) rotate(${rotate}deg)`;
            }
          }}
        >
          {svg}
          {showNeedle ? (
            <span
              data-needle-tip
              className="pointer-events-none absolute left-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${tipTopPct}%` }}
              aria-hidden
            />
          ) : null}
        </div>
      </div>

      {label ? (
        <p
          className={cn(
            "max-w-[16rem] px-1 text-center font-medium text-[color:var(--dash-text)]",
            large ? "mt-2 text-xs sm:mt-3 sm:text-sm" : "mt-2 text-[11px]",
          )}
        >
          {label}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Syringe size chooser                                                       */
/* -------------------------------------------------------------------------- */

export function SyringeSizeOption({
  size,
  selected,
  onSelect,
}: {
  size: SyringeSizeMl;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "calc-syringe-option relative z-10 inline-flex h-10 min-w-[3.5rem] shrink-0 items-center justify-center rounded-lg border px-2.5 text-xs font-medium leading-none tracking-[0.01em] transition duration-200 sm:h-11 sm:min-w-[4.5rem] sm:px-3.5 sm:text-sm",
        selected
          ? "border-[#DDE466] bg-[#DDE466]/25 text-[color:var(--sidebar-active-fg,#6f7a1c)]"
          : "border-[color:var(--dash-surface-border)] text-[color:var(--dash-muted)] hols-option-hover hover:text-[color:var(--dash-text)]",
      )}
      aria-pressed={selected}
    >
      {size} ml
    </button>
  );
}
