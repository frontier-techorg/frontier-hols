"use client";

/**
 * Reconstitution syringe animation.
 *
 * Positioning model (important):
 * We animate the syringe WRAP PIVOT (center of the rotator box) + rotation.
 * The needle tip is derived from that: tip = pivot + rotate(tipRel, rotation).
 *
 * Why not tip-chasing? When the syringe is horizontal, aiming the tip at a
 * vial stopper parks the long barrel across both vials (the "bridge" bug).
 * Pivot-centering keeps the body over the active vial / travel lane.
 *
 * SyringeArt is drawn needle-down natively:
 *   Rotation 0°  = needle straight down (insert / draw)
 *   Rotation −90° = needle right (horizontal travel)
 */

import { memo, useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { CalculatorReconScene } from "@/components/platform/provider/student/calculator/CalculatorReconScene";
import {
  isWaterSupplyEmpty,
  medFillAfterReconstitution,
  medPowderFillFromAmount,
  reconstitutionDrawVolumeMl,
  syringeFillFromDrawVolume,
  waterFillAfterDraw,
  waterFillFromVolume,
} from "@/components/platform/provider/student/calculator/calculatorFillLevels";
import {
  measureStaticDrawTargets,
  svgAttrSetter,
  svgLayerTranslateYSetter,
  svgLayersTranslateYSetter,
  syringeFillOffsetY,
  syringeLiquidLayout,
  vialLiquidOffsetY,
} from "@/components/platform/provider/student/calculator/calculatorGeometry";
import { bacWaterLiquidOffsetY } from "@/components/platform/provider/student/calculator/BacWaterVialArt";
import { HEXARELIN_SRC } from "@/components/platform/provider/student/calculator/HexarelinVialArt";
import { SYRINGE_ART } from "@/components/platform/provider/student/calculator/SyringeArt";
import { gsap, registerGsap } from "@/lib/gsap";
import type { MassUnit, SyringeSizeMl } from "@/lib/integrate/provider/student/calculator";
import { prefersReducedMotion } from "@/lib/motion";
import type { RefObject } from "react";

type InjectionAnimationProps = {
  onComplete: () => void;
  syringeMl?: SyringeSizeMl;
  peptideUnit?: MassUnit;
  waterMl?: number;
  peptideAmount?: number;
  /** Already inside the calculator illustration card. */
  embedded?: boolean;
};

const STAGE = {
  intro: 0.7,
  holdHorizontal: 0.35,
  rotateDownWater: 0.7,
  insertWater: 0.35,
  draw: 1.1,
  drawPause: 0.18,
  withdrawWater: 0.28,
  lift: 0.3,
  flatten: 0.4,
  slide: 0.75,
  rotateDownMed: 0.7,
  insertMed: 0.32,
  inject: 1.1,
  settle: 0.35,
  withdrawMed: 0.4,
  fadeOut: 0.3,
} as const;

const ROT_H = -90;
const ROT_V = 0;
/** Desktop-tuned insert depth as a fraction of vial height (through the cap, not into the body). */
const INSERT_FRAC = 0.12;
/** Tip clearance above the stopper while hovering / traveling — only insert touches the vial. */
const HOVER_FRAC = 0.26;
const INSERT_MIN_PX = 5;
const INSERT_MAX_PX = 32;
const HOVER_MIN_PX = 32;
const HOVER_MAX_PX = 72;

type Pt = { x: number; y: number };

function rotateVec(v: Pt, deg: number): Pt {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Pivot so the needle tip sits on `tip` at the given rotation. */
function pivotForTip(tip: Pt, tipRel: Pt, rotation: number): Pt {
  const r = rotateVec(tipRel, rotation);
  return { x: tip.x - r.x, y: tip.y - r.y };
}

/**
 * Keep the syringe body inside the scene.
 * tipDrop ≈ pivot→tip; when needle-down the thumb sits ~tipDrop above the pivot.
 */
function clampPivotInScene(
  pivot: Pt,
  tipDrop: number,
  rotation: number,
  sceneW: number,
  sceneH: number,
): Pt {
  const horizontal = Math.abs(rotation - ROT_H) < 45;
  const marginX = tipDrop * (horizontal ? 0.58 : 0.18);
  // Vertical: full half-length above pivot + inset so the thumb never clips.
  const marginTop = horizontal ? tipDrop * 0.22 : tipDrop + 14;
  const marginBottom = tipDrop * (horizontal ? 0.22 : 0.1);
  return {
    x: Math.min(sceneW - marginX, Math.max(marginX, pivot.x)),
    y: Math.min(sceneH - marginBottom, Math.max(marginTop, pivot.y)),
  };
}

/** Cap hover so tipDrop*2 + hover still fits under the scene top. */
function hoverGapThatFits(
  stopperY: number,
  tipDrop: number,
  desired: number,
  scenePad = 14,
): number {
  const maxFit = stopperY - tipDrop * 2 - scenePad;
  return Math.max(6, Math.min(desired, maxFit));
}

/** Scale motion offsets with the rendered vial so phones match desktop proportions. */
function vialMotionOffsets(scene: HTMLElement, which: "water" | "med") {
  const root = scene.querySelector(`[data-vial-root="${which}"]`);
  const height = root?.getBoundingClientRect().height || 160;
  const insert = Math.min(INSERT_MAX_PX, Math.max(INSERT_MIN_PX, height * INSERT_FRAC));
  const hover = Math.min(HOVER_MAX_PX, Math.max(HOVER_MIN_PX, height * HOVER_FRAC));
  return { insert, hover, height };
}

type Dom = {
  waterColumn: HTMLElement | null;
  medColumn: HTMLElement | null;
  waterLiquidLayer: HTMLElement | null;
  medLiquidLayer: HTMLElement | null;
  medPowderLayers: NodeListOf<HTMLElement> | null;
  waterSurfaceMarker: HTMLElement | null;
  medSurfaceMarker: HTMLElement | null;
  syringeLiquidLayer: HTMLElement | null;
  syringeLiquidFill: SVGRectElement | null;
  syringePlungerLayers: NodeListOf<HTMLElement> | null;
  syringeRotator: HTMLElement | null;
  syringeRotators: NodeListOf<HTMLElement> | null;
  needleWrap: HTMLElement | null;
  contactShadow: HTMLElement | null;
  medGlow: HTMLElement | null;
  mixBubbles: HTMLElement | null;
  mixBubbleNodes: NodeListOf<HTMLElement> | null;
  setWaterLiquidY: ((v: number) => void) | null;
  setWaterSurfaceY: ((v: number) => void) | null;
  setMedLiquidY: ((v: number) => void) | null;
  setMedSurfaceY: ((v: number) => void) | null;
  setSyringeLiquidY: ((v: number) => void) | null;
  setSyringeLiquidHeight: ((v: number) => void) | null;
  setSyringePlungerY: ((v: number) => void) | null;
  setWrapX: (v: number) => void;
  setWrapY: (v: number) => void;
};

function queryDom(scene: HTMLElement, wrap: HTMLElement): Dom | null {
  const waterRoot = scene.querySelector('[data-vial-root="water"]');
  const medRoot = scene.querySelector('[data-vial-root="med"]');
  if (!waterRoot || !medRoot) return null;

  const waterLiquidLayers = scene.querySelectorAll<HTMLElement>(
    '[data-vial-column="water"] [data-vial-liquid-layer], [data-vial-column="water-front"] [data-vial-liquid-layer]',
  );
  const waterLiquidLayer =
    waterLiquidLayers[0] ?? waterRoot.querySelector<HTMLElement>("[data-vial-liquid-layer]");
  const medLiquidLayer = medRoot.querySelector<HTMLElement>("[data-vial-liquid-layer]");
  const medPowderLayers = scene.querySelectorAll<HTMLElement>("[data-vial-powder-layer]");
  const waterSurfaceMarker = waterRoot.querySelector<HTMLElement>("[data-vial-liquid-surface]");
  const medSurfaceMarker = medRoot.querySelector<HTMLElement>("[data-vial-liquid-surface]");
  const syringeLiquidLayer = wrap.querySelector<HTMLElement>("[data-syringe-liquid-layer]");
  const syringeLiquidFill = wrap.querySelector<SVGRectElement>("[data-syringe-liquid-fill]");
  const syringePlungerLayers = wrap.querySelectorAll<HTMLElement>("[data-syringe-plunger-layer]");
  const syringeRotator = wrap.querySelector<HTMLElement>("[data-syringe-rotator]");
  const syringeRotators = scene.querySelectorAll<HTMLElement>("[data-syringe-rotator]");
  const needleWrap = scene.querySelector<HTMLElement>("[data-syringe-needle-wrap]");
  const contactShadow = scene.querySelector<HTMLElement>("[data-syringe-contact-shadow]");
  const waterColumn = scene.querySelector<HTMLElement>('[data-vial-column="water"]');
  const medColumn = scene.querySelector<HTMLElement>('[data-vial-column="med"]');
  const mixBubbles = medRoot.querySelector<HTMLElement>("[data-vial-mix-bubbles]");
  const mixBubbleNodes = medRoot.querySelectorAll<HTMLElement>("[data-vial-mix-bubble]");

  let medGlow = medRoot.querySelector<HTMLElement>("[data-vial-recon-glow]");
  if (!medGlow && medRoot instanceof HTMLElement) {
    medGlow = document.createElement("div");
    medGlow.setAttribute("data-vial-recon-glow", "");
    medGlow.className = "pointer-events-none absolute inset-0 rounded-full opacity-0";
    medGlow.style.background =
      "radial-gradient(circle at 50% 62%, rgba(141,195,225,0.38) 0%, rgba(56,83,164,0.12) 45%, transparent 68%)";
    medGlow.style.transform = "scale(1.15)";
    const artHost = medRoot.querySelector(".relative");
    if (artHost instanceof HTMLElement) {
      artHost.style.position = "relative";
      artHost.appendChild(medGlow);
    }
  }

  return {
    waterColumn,
    medColumn,
    waterLiquidLayer,
    medLiquidLayer,
    medPowderLayers,
    waterSurfaceMarker,
    medSurfaceMarker,
    syringeLiquidLayer,
    syringeLiquidFill,
    syringePlungerLayers,
    syringeRotator,
    syringeRotators,
    needleWrap,
    contactShadow,
    medGlow,
    mixBubbles,
    mixBubbleNodes,
    setWaterLiquidY: svgLayersTranslateYSetter(waterLiquidLayers) ?? svgLayerTranslateYSetter(waterLiquidLayer),
    setWaterSurfaceY: svgLayerTranslateYSetter(waterSurfaceMarker),
    setMedLiquidY: svgLayerTranslateYSetter(medLiquidLayer),
    setMedSurfaceY: svgLayerTranslateYSetter(medSurfaceMarker),
    setSyringeLiquidY: svgAttrSetter(syringeLiquidFill, "y"),
    setSyringeLiquidHeight: svgAttrSetter(syringeLiquidFill, "height"),
    setSyringePlungerY: svgLayerTranslateYSetter(
      syringePlungerLayers && syringePlungerLayers.length > 0
        ? syringePlungerLayers[0]
        : null,
    ),
    setWrapX: gsap.quickSetter(wrap, "x", "px") as (v: number) => void,
    setWrapY: gsap.quickSetter(wrap, "y", "px") as (v: number) => void,
  };
}

const DrawScene = memo(function DrawScene({
  sceneRef,
  syringeWrapRef,
  syringeMl,
  peptideUnit,
  waterFill,
  waterEmpty = false,
  medFill,
}: {
  sceneRef: RefObject<HTMLDivElement | null>;
  syringeWrapRef: RefObject<HTMLDivElement | null>;
  syringeMl: SyringeSizeMl;
  peptideUnit: MassUnit;
  waterFill: number;
  waterEmpty?: boolean;
  medFill: number;
}) {
  return (
    <CalculatorReconScene
      layout="draw"
      drawSyringeLarge
      sceneRef={sceneRef}
      syringeWrapRef={syringeWrapRef}
      syringeMl={syringeMl}
      peptideUnit={peptideUnit}
      gsapDriven
      instantFill
      showSyringeFill
      syringeFill={0}
      waterFill={waterFill}
      waterEmpty={waterEmpty}
      medFill={medFill}
      medPowder
      // GSAP focus() owns highlight — CSS dim would leave front labels translucent
      waterActive={false}
      medActive={false}
    />
  );
});

export function InjectionAnimation({
  onComplete,
  syringeMl = 1,
  peptideUnit = "mg",
  waterMl = 1,
  peptideAmount = 10,
  embedded = false,
}: InjectionAnimationProps) {
  const [status, setStatus] = useState("Positioning syringe over bacteriostatic water…");
  const [done, setDone] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const syringeWrapRef = useRef<HTMLDivElement>(null);
  const completed = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      const t1 = window.setTimeout(() => setStatus("Preparing dose calculation…"), 0);
      const t2 = window.setTimeout(() => {
        if (!completed.current) {
          completed.current = true;
          onComplete();
        }
      }, 320);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
  }, [onComplete]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setTimeout(() => {
      const node = stageRef.current;
      if (!node) return;
      const narrow = window.matchMedia("(max-width: 767px)").matches;
      node.scrollIntoView({
        behavior: "smooth",
        block: narrow ? "nearest" : "center",
        inline: "nearest",
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion() || !syringeWrapRef.current || !sceneRef.current) return;

      let tl: gsap.core.Timeline | null = null;
      let cancelled = false;

      const startTimeline = () => {
        if (cancelled || !syringeWrapRef.current || !sceneRef.current) return;

        const sceneEl = sceneRef.current;
        const wrapEl = syringeWrapRef.current;
        const dom = queryDom(sceneEl, wrapEl);
        if (!dom) return;

        // Identity pose for measurement — tipRel is measured at rotation 0°.
        gsap.set(wrapEl, { x: 0, y: 0, force3D: true, opacity: 1 });
        if (dom.needleWrap) {
          dom.needleWrap.style.transform = "translate(0px, 0px)";
          dom.needleWrap.style.opacity = "1";
        }
        const rotators =
          dom.syringeRotators && dom.syringeRotators.length > 0
            ? Array.from(dom.syringeRotators)
            : dom.syringeRotator
              ? [dom.syringeRotator]
              : [];
        rotators.forEach((el) => {
          gsap.set(el, { clearProps: "transform" });
          el.style.transformOrigin = "center center";
          el.style.transform = "translate(-50%, -50%) rotate(0deg)";
        });
        if (dom.contactShadow) gsap.set(dom.contactShadow, { opacity: 0, scale: 0.85 });

        const targets = measureStaticDrawTargets(sceneEl, wrapEl);
        if (!targets) return;

        const wrapRect = wrapEl.getBoundingClientRect();
        const sceneRect = sceneEl.getBoundingClientRect();
        const pivot0: Pt = {
          x: wrapRect.left + wrapRect.width / 2 - sceneRect.left,
          y: wrapRect.top + wrapRect.height / 2 - sceneRect.top,
        };
        const tipRel: Pt = {
          x: targets.tipAtZero.x - pivot0.x,
          y: targets.tipAtZero.y - pivot0.y,
        };

        const water = targets.waterStopper;
        const med = targets.medStopper;

        // tipDrop ≈ pivot→tip when needle-down; scale needle length from art proportions.
        const tipDrop = Math.abs(rotateVec(tipRel, ROT_V).y) || Math.abs(tipRel.x);
        const needleArtLen = SYRINGE_ART.tipY - SYRINGE_ART.hubY;
        const tipArtDrop = SYRINGE_ART.tipY - (SYRINGE_ART.viewTop + SYRINGE_ART.viewBottom) / 2;
        const needleLenPx = tipDrop * (needleArtLen / Math.max(1, tipArtDrop));

        const waterMotion = vialMotionOffsets(sceneEl, "water");
        const medMotion = vialMotionOffsets(sceneEl, "med");
        // Cap insert at ~45% of needle so the hub never sinks into the bottle.
        const maxInsertByNeedle = Math.max(INSERT_MIN_PX, needleLenPx * 0.45);
        const waterInsertDepth = Math.min(waterMotion.insert, maxInsertByNeedle, INSERT_MAX_PX);
        const medInsertDepth = Math.min(medMotion.insert, maxInsertByNeedle, INSERT_MAX_PX);

        const sceneW = sceneRect.width;
        const sceneH = sceneRect.height;
        const narrowScene = sceneW < 420;

        // Desired hover, then shrink on phones so the thumb never leaves the card.
        const waterHoverDesired = Math.min(
          narrowScene ? 44 : HOVER_MAX_PX,
          Math.max(waterMotion.hover, needleLenPx * (narrowScene ? 0.85 : 1.15), narrowScene ? 18 : HOVER_MIN_PX),
        );
        const medHoverDesired = Math.min(
          narrowScene ? 44 : HOVER_MAX_PX,
          Math.max(medMotion.hover, needleLenPx * (narrowScene ? 0.85 : 1.15), narrowScene ? 18 : HOVER_MIN_PX),
        );
        const waterHoverGap = hoverGapThatFits(water.y, tipDrop, waterHoverDesired);
        const medHoverGap = hoverGapThatFits(med.y, tipDrop, medHoverDesired);

        /** Hover / insert pivots — tip locked onto the vial stopper only on insert. */
        const waterHover = pivotForTip(
          { x: water.x, y: water.y - waterHoverGap },
          tipRel,
          ROT_V,
        );
        const waterInsert = pivotForTip(
          { x: water.x, y: water.y + waterInsertDepth },
          tipRel,
          ROT_V,
        );
        const medHover = pivotForTip(
          { x: med.x, y: med.y - medHoverGap },
          tipRel,
          ROT_V,
        );
        const medInsert = pivotForTip(
          { x: med.x, y: med.y + medInsertDepth },
          tipRel,
          ROT_V,
        );

        /**
         * Horizontal travel lane — lift above hover so the barrel never skims
         * the caps while sliding between bottles.
         */
        const travelLift = Math.max(
          narrowScene ? 8 : 14,
          Math.min(narrowScene ? 18 : 36, tipDrop * (narrowScene ? 0.05 : 0.08)),
        );
        let travelY = waterHover.y - travelLift;
        // Keep horizontal lane below the top edge (plunger/thumb clearance).
        travelY = Math.max(travelY, tipDrop * (narrowScene ? 0.42 : 0.32) + 10);

        const clampH = (p: Pt) => clampPivotInScene(p, tipDrop, ROT_H, sceneW, sceneH);
        const clampV = (p: Pt) => clampPivotInScene(p, tipDrop, ROT_V, sceneW, sceneH);

        const waterFlat: Pt = clampH({ x: water.x, y: travelY });
        const medFlat: Pt = clampH({ x: med.x, y: travelY });

        // Intro: enter horizontally above water, then sit before rotating down.
        const waterIntro: Pt = clampH({
          x: water.x,
          y: travelY - Math.max(narrowScene ? 4 : 8, waterHoverGap * (narrowScene ? 0.08 : 0.2)),
        });
        const waterEnter: Pt = clampH({
          x: water.x - Math.max(narrowScene ? 8 : 36, tipDrop * (narrowScene ? 0.04 : 0.12)),
          y: waterIntro.y - Math.max(narrowScene ? 6 : 18, tipDrop * (narrowScene ? 0.02 : 0.05)),
        });

        // Re-clamp vertical hover/insert after travelY adjustment.
        const waterHoverSafe = clampV(waterHover);
        const waterInsertSafe = clampV(waterInsert);
        const medHoverSafe = clampV(medHover);
        const medInsertSafe = clampV(medInsert);

        const drawMl = reconstitutionDrawVolumeMl(waterMl, syringeMl);
        const startWater = waterFillFromVolume(waterMl);
        // Drain the full chosen reconstitution volume — that water moves into
        // the med vial. Results overview uses the same endWater (empty).
        const endWater = waterFillAfterDraw(startWater, waterMl, waterMl);
        const startMed = medPowderFillFromAmount(peptideAmount, peptideUnit);
        const endSyringe = syringeFillFromDrawVolume(drawMl, syringeMl);
        const endMed = medFillAfterReconstitution(waterMl, peptideAmount, peptideUnit);

        const proxy = {
          pivotX: waterEnter.x,
          pivotY: waterEnter.y,
          rotation: ROT_H,
          waterFill: startWater,
          waterOpacity: 1,
          medFill: startMed,
          syringeFill: 0,
          wrapOpacity: 1,
          shadowOpacity: 0,
        };

        let medPowder = true;

        const focus = (which: "water" | "med") => {
          // Front + back columns — front holds the opaque labels; dimming only
          // the back layer left labels at ~58% and made liquid show through.
          const waterCols = sceneEl.querySelectorAll<HTMLElement>(
            '[data-vial-column="water"], [data-vial-column="water-front"]',
          );
          const medCols = sceneEl.querySelectorAll<HTMLElement>(
            '[data-vial-column="med"], [data-vial-column="med-front"]',
          );
          const on = which === "water" ? waterCols : medCols;
          const off = which === "water" ? medCols : waterCols;
          on.forEach((el) => {
            gsap.to(el, {
              opacity: 1,
              filter: "none",
              duration: 0.3,
              overwrite: "auto",
            });
          });
          off.forEach((el) => {
            gsap.to(el, {
              opacity: 0.82,
              filter: "none",
              duration: 0.3,
              overwrite: "auto",
            });
          });
        };

        const applyFills = () => {
          const waterEmpty = isWaterSupplyEmpty(proxy.waterFill) || proxy.waterOpacity <= 0.05;
          const wOff = bacWaterLiquidOffsetY(proxy.waterFill, waterEmpty);
          dom.setWaterLiquidY?.(wOff);
          dom.setWaterSurfaceY?.(wOff);
          if (dom.waterLiquidLayer) {
            dom.waterLiquidLayer.setAttribute(
              "opacity",
              String(waterEmpty ? 0 : Math.max(0, Math.min(1, proxy.waterOpacity))),
            );
          }

          const mOff = vialLiquidOffsetY(proxy.medFill, {
            powder: medPowder,
            interiorHeight: HEXARELIN_SRC.interiorHeight,
          });
          dom.setMedLiquidY?.(mOff);
          dom.setMedSurfaceY?.(mOff);
          if (dom.medLiquidLayer && !medPowder) {
            dom.medLiquidLayer.setAttribute("opacity", proxy.medFill > 0.04 ? "1" : "0");
          }

          const plungerY = syringeFillOffsetY(proxy.syringeFill);
          const liquid = syringeLiquidLayout(proxy.syringeFill);
          dom.setSyringePlungerY?.(plungerY);
          dom.setSyringeLiquidY?.(liquid.y);
          dom.setSyringeLiquidHeight?.(liquid.height);
          if (dom.syringeLiquidLayer) {
            const layer = dom.syringeLiquidLayer as HTMLElement & SVGElement;
            if (layer.style) layer.style.opacity = "";
            layer.setAttribute("opacity", proxy.syringeFill > 0.008 ? "1" : "0");
          }
        };

        const updateFrame = () => {
          if (cancelled) return;
          const dx = proxy.pivotX - pivot0.x;
          const dy = proxy.pivotY - pivot0.y;
          dom.setWrapX(dx);
          dom.setWrapY(dy);
          if (dom.needleWrap) {
            dom.needleWrap.style.transform = `translate(${dx}px, ${dy}px)`;
          }
          applyFills();

          const rot = `translate(-50%, -50%) rotate(${proxy.rotation}deg)`;
          if (dom.syringeRotators && dom.syringeRotators.length > 0) {
            dom.syringeRotators.forEach((el) => {
              el.style.transform = rot;
            });
          } else if (dom.syringeRotator) {
            dom.syringeRotator.style.transform = rot;
          }
          wrapEl.style.opacity = String(Math.max(0, Math.min(1, proxy.wrapOpacity)));
          if (dom.needleWrap) {
            dom.needleWrap.style.opacity = String(Math.max(0, Math.min(1, proxy.wrapOpacity)));
          }

          if (dom.contactShadow) {
            const tip = rotateVec(tipRel, proxy.rotation);
            dom.contactShadow.style.left = `${proxy.pivotX + tip.x - 28}px`;
            dom.contactShadow.style.top = `${proxy.pivotY + tip.y + 18}px`;
            dom.contactShadow.style.opacity = String(proxy.shadowOpacity);
          }
        };

        if (dom.medLiquidLayer) {
          dom.medLiquidLayer.setAttribute("opacity", "0");
          (dom.medLiquidLayer as HTMLElement).style.transform = "";
        }
        if (dom.medPowderLayers) {
          dom.medPowderLayers.forEach((layer) => {
            layer.style.transform = "";
          });
        }
        if (dom.syringeLiquidLayer) {
          dom.syringeLiquidLayer.setAttribute("opacity", "0");
        }

        applyFills();
        updateFrame();

        // Absolute timeline offsets
        let t = 0;
        const mark = (d: number) => {
          const start = t;
          t += d;
          return start;
        };
        const tIntro = mark(STAGE.intro);
        const tHoldH = mark(STAGE.holdHorizontal);
        const tRotWater = mark(STAGE.rotateDownWater);
        const tInsWater = mark(STAGE.insertWater);
        const tDraw = mark(STAGE.draw);
        const tPause = mark(STAGE.drawPause);
        const tWdWater = mark(STAGE.withdrawWater);
        const tTravel = mark(STAGE.lift + STAGE.flatten);
        const tSlide = mark(STAGE.slide);
        const tRotMed = mark(STAGE.rotateDownMed);
        const tInsMed = mark(STAGE.insertMed);
        const tInject = mark(STAGE.inject);
        const tSettle = mark(STAGE.settle);
        const tWdMed = mark(STAGE.withdrawMed);
        const tFade = mark(STAGE.fadeOut);
        void tPause;

        const say = (label: string) => () => {
          if (!cancelled) setStatus(label);
        };

        tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          onComplete: () => {
            setDone(true);
            window.setTimeout(() => {
              if (completed.current) return;
              completed.current = true;
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
              onComplete();
            }, 450);
          },
        });

        tl.call(say("Positioning syringe over bacteriostatic water…"), undefined, tIntro)
          .call(() => focus("water"), undefined, tIntro)
          // Slide in while staying horizontal (needle right).
          .to(
            proxy,
            {
              pivotX: waterIntro.x,
              pivotY: waterIntro.y,
              rotation: ROT_H,
              wrapOpacity: 1,
              duration: STAGE.intro,
              ease: "power2.out",
              onUpdate: updateFrame,
            },
            tIntro,
          )
          // Brief park so the horizontal pose reads before rotate-down.
          .to(
            proxy,
            {
              pivotX: waterIntro.x,
              pivotY: waterIntro.y,
              rotation: ROT_H,
              duration: STAGE.holdHorizontal,
              ease: "none",
              onUpdate: updateFrame,
            },
            tHoldH,
          )

          // Rotate needle-down over water
          .call(say("Rotating syringe down toward the bacteriostatic bottle…"), undefined, tRotWater)
          .to(
            proxy,
            {
              pivotX: waterHoverSafe.x,
              pivotY: waterHoverSafe.y,
              rotation: ROT_V,
              shadowOpacity: 0.35,
              duration: STAGE.rotateDownWater,
              onUpdate: updateFrame,
            },
            tRotWater,
          )

          // Insert into water stopper
          .to(
            proxy,
            {
              pivotX: waterInsertSafe.x,
              pivotY: waterInsertSafe.y,
              shadowOpacity: 0.55,
              duration: STAGE.insertWater,
              ease: "power3.inOut",
              onUpdate: updateFrame,
            },
            tInsWater,
          )

          // Draw — drop the bottle level by the volume taken into the syringe
          .call(say("Drawing bacteriostatic water into the syringe…"), undefined, tDraw)
          .to(
            proxy,
            {
              waterFill: endWater,
              waterOpacity: isWaterSupplyEmpty(endWater) ? 0 : 1,
              syringeFill: endSyringe,
              duration: STAGE.draw,
              ease: "power1.inOut",
              onUpdate: updateFrame,
            },
            tDraw,
          )

          // Withdraw from water
          .to(
            proxy,
            {
              pivotX: waterHoverSafe.x,
              pivotY: waterHoverSafe.y,
              duration: STAGE.withdrawWater,
              ease: "power3.out",
              onUpdate: updateFrame,
            },
            tWdWater,
          )

          // Flatten in place above water (no extra lift — keeps plunger inside the card)
          .call(say("Moving syringe to the medication vial…"), undefined, tTravel)
          .call(() => focus("med"), undefined, tTravel)
          .to(
            proxy,
            {
              pivotX: waterFlat.x,
              pivotY: waterFlat.y,
              rotation: ROT_H,
              shadowOpacity: 0,
              duration: STAGE.lift + STAGE.flatten,
              ease: "power2.inOut",
              onUpdate: updateFrame,
            },
            tTravel,
          )

          // Slide — pivot moves from water to med at the same safe height
          .to(
            proxy,
            {
              pivotX: medFlat.x,
              pivotY: medFlat.y,
              rotation: ROT_H,
              duration: STAGE.slide,
              ease: "power2.inOut",
              onUpdate: updateFrame,
            },
            tSlide,
          )

          // Rotate needle-down over med
          .call(say("Rotating syringe down over the medication vial…"), undefined, tRotMed)
          .to(
            proxy,
            {
              pivotX: medHoverSafe.x,
              pivotY: medHoverSafe.y,
              rotation: ROT_V,
              shadowOpacity: 0.35,
              duration: STAGE.rotateDownMed,
              onUpdate: updateFrame,
            },
            tRotMed,
          )

          // Insert into med
          .to(
            proxy,
            {
              pivotX: medInsertSafe.x,
              pivotY: medInsertSafe.y,
              shadowOpacity: 0.55,
              duration: STAGE.insertMed,
              ease: "power3.inOut",
              onUpdate: updateFrame,
            },
            tInsMed,
          )

          // Inject + reconstitute (powder dissolves with rising bubbles)
          .call(say("Injecting water and reconstituting…"), undefined, tInject)
          .call(
            () => {
              medPowder = false;
              proxy.medFill = 0.06;
              if (dom.medPowderLayers && dom.medPowderLayers.length > 0) {
                gsap.to(dom.medPowderLayers, {
                  attr: { opacity: 0 },
                  duration: STAGE.inject * 0.55,
                  ease: "power1.out",
                  force3D: false,
                });
              }
              if (dom.medLiquidLayer) {
                gsap.fromTo(
                  dom.medLiquidLayer,
                  { attr: { opacity: 0 } },
                  {
                    attr: { opacity: 1 },
                    duration: STAGE.inject * 0.35,
                    ease: "power1.out",
                    force3D: false,
                  },
                );
              }
              if (dom.mixBubbles && dom.mixBubbleNodes && dom.mixBubbleNodes.length > 0) {
                // Bubbles are children of the liquid layer — they travel with the
                // rising fill. Only nudge them slightly under the meniscus.
                gsap.set(dom.mixBubbles, { attr: { opacity: 1 } });
                Array.from(dom.mixBubbleNodes).forEach((node, i) => {
                  const startCy = Number(node.getAttribute("cy") || 180);
                  const meniscusFloor = HEXARELIN_SRC.interiorTop + 8;
                  const drift = 4 + (i % 5) * 2.2;
                  const peak = Math.max(meniscusFloor, startCy - drift);
                  const delay = (i % 7) * 0.06 + (i > 7 ? STAGE.inject * 0.22 : 0);
                  gsap.fromTo(
                    node,
                    { attr: { opacity: 0, cy: startCy + 6 } },
                    {
                      attr: { opacity: 0.85, cy: peak },
                      duration: STAGE.inject * 0.7,
                      delay,
                      ease: "sine.out",
                      force3D: false,
                    },
                  );
                  gsap.to(node, {
                    attr: { opacity: 0.25 },
                    duration: STAGE.inject * 0.35,
                    delay: delay + STAGE.inject * 0.45,
                    ease: "sine.inOut",
                    force3D: false,
                  });
                });
                gsap.to(dom.mixBubbles, {
                  attr: { opacity: 0 },
                  duration: 0.4,
                  delay: STAGE.inject + STAGE.settle * 0.5,
                  ease: "power1.out",
                  force3D: false,
                });
              }
              applyFills();
            },
            undefined,
            tInject,
          )
          .to(
            proxy,
            {
              syringeFill: 0,
              medFill: endMed,
              duration: STAGE.inject,
              ease: "power1.inOut",
              onUpdate: updateFrame,
            },
            tInject,
          )

          // Settle glow — rotation stays vertical (no flick)
          .to(
            dom.medGlow,
            { opacity: 0.7, duration: STAGE.settle * 0.55, ease: "power2.out" },
            tSettle,
          )
          .to(
            dom.medGlow,
            { opacity: 0.35, duration: STAGE.settle * 0.45, ease: "sine.inOut" },
            tSettle + STAGE.settle * 0.55,
          )

          // Withdraw straight up, still needle-down
          .call(say("Reconstitution complete"), undefined, tWdMed)
          .to(
            proxy,
            {
              pivotX: medHoverSafe.x,
              pivotY: medHoverSafe.y - 16,
              rotation: ROT_V,
              shadowOpacity: 0,
              duration: STAGE.withdrawMed,
              ease: "power3.inOut",
              onUpdate: updateFrame,
            },
            tWdMed,
          )

          // Fade syringe out cleanly
          .to(
            proxy,
            {
              wrapOpacity: 0,
              duration: STAGE.fadeOut,
              ease: "power1.in",
              onUpdate: updateFrame,
            },
            tFade,
          )
          .to(
            dom.medGlow,
            { opacity: 0.2, duration: STAGE.fadeOut, ease: "sine.out" },
            tFade,
          );
      };

      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(startTimeline);
      });

      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frame);
        tl?.kill();
      };
    },
    { scope: stageRef, dependencies: [onComplete, syringeMl, peptideUnit, waterMl, peptideAmount] },
  );

  const sceneWaterStart = waterFillFromVolume(waterMl);
  // Match timeline endWater — full reconstitution volume drained.
  const sceneWaterEnd = waterFillAfterDraw(sceneWaterStart, waterMl, waterMl);
  const sceneWaterFill = done ? sceneWaterEnd : sceneWaterStart;
  const sceneWaterEmpty = done && isWaterSupplyEmpty(sceneWaterFill);
  const sceneMedFill = medPowderFillFromAmount(peptideAmount, peptideUnit);

  return (
    <div className="mx-auto w-full min-w-0">
      <p
        className="mb-2 break-words px-1 text-center text-sm font-medium leading-snug text-[color:var(--dash-text)]"
        aria-live="polite"
      >
        {status}
      </p>

      <div
        ref={stageRef}
        className={
          embedded
            ? "relative isolate mx-auto w-full min-w-0 overflow-visible px-1 pb-1 pt-1"
            : "dashboard-glass-card relative isolate mx-auto w-full min-w-0 overflow-hidden rounded-2xl px-1 pb-2 pt-2 max-[390px]:rounded-xl max-[390px]:px-0.5 max-[390px]:pb-1.5 max-[390px]:pt-1.5 sm:px-10 sm:pb-5 sm:pt-5 md:px-12 md:pt-6"
        }
      >
        <DrawScene
          sceneRef={sceneRef}
          syringeWrapRef={syringeWrapRef}
          syringeMl={syringeMl}
          peptideUnit={peptideUnit}
          waterFill={sceneWaterFill}
          waterEmpty={sceneWaterEmpty}
          medFill={sceneMedFill}
        />

        {done ? (
          <div className="absolute inset-x-0 bottom-2 flex justify-center sm:bottom-3">
            <span className="rounded-full bg-[#5BA8A6]/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-[#3D8A87]">
              Ready
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
