"use client";

import { useCallback, useEffect, useRef } from "react";
import { gsap, registerGsap } from "@/lib/gsap";

type SpreadHoverOptions = {
  fillColor: string;
  defaultColor: string;
  hoverColor: string;
  spreadDuration?: number;
  leaveDuration?: number;
  enabled?: boolean;
};

const SPREAD_DURATION = 1.15;
const LEAVE_DURATION = 0.9;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useSpreadHover({
  fillColor,
  defaultColor,
  hoverColor,
  spreadDuration = SPREAD_DURATION,
  leaveDuration = LEAVE_DURATION,
  enabled = true,
}: SpreadHoverOptions) {
  const containerRef = useRef<HTMLElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const fillTweenRef = useRef<gsap.core.Tween | null>(null);
  const textTweenRef = useRef<gsap.core.Tween | null>(null);

  const resetHover = useCallback(() => {
    registerGsap();
    fillTweenRef.current?.kill();
    textTweenRef.current?.kill();
    fillTweenRef.current = null;
    textTweenRef.current = null;
    const fill = fillRef.current;
    const label = labelRef.current;
    if (fill) gsap.set(fill, { scale: 0, opacity: 0 });
    if (label) gsap.set(label, { color: defaultColor });
  }, [defaultColor]);

  // Clear any in-flight navy fill when the control is disabled or remounted.
  useEffect(() => {
    if (enabled) return;
    resetHover();
  }, [enabled, resetHover]);

  const positionFill = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      const fill = fillRef.current;
      if (!container || !fill) return;

      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const size = Math.hypot(rect.width, rect.height) * 2.4;

      gsap.set(fill, {
        width: size,
        height: size,
        left: x - size / 2,
        top: y - size / 2,
        xPercent: 0,
        yPercent: 0,
        scale: 0,
        opacity: 1,
        transformOrigin: "50% 50%",
        backgroundColor: fillColor,
      });
    },
    [fillColor],
  );

  const onMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!enabled) return;

      registerGsap();
      positionFill(event.clientX, event.clientY);

      const fill = fillRef.current;
      const label = labelRef.current;
      if (!fill) return;

      fillTweenRef.current?.kill();
      textTweenRef.current?.kill();

      if (prefersReducedMotion()) {
        gsap.set(fill, { scale: 1 });
        if (label) gsap.set(label, { color: hoverColor });
        return;
      }

      fillTweenRef.current = gsap.fromTo(
        fill,
        { scale: 0, opacity: 0.85 },
        {
          scale: 1,
          opacity: 1,
          duration: spreadDuration,
          ease: "power1.inOut",
        },
      );

      if (label) {
        textTweenRef.current = gsap.fromTo(
          label,
          { color: defaultColor },
          {
            color: hoverColor,
            duration: spreadDuration * 0.85,
            delay: spreadDuration * 0.18,
            ease: "power2.out",
          },
        );
      }
    },
    [defaultColor, enabled, hoverColor, positionFill, spreadDuration],
  );

  const onMouseLeave = useCallback(() => {
    if (!enabled) {
      resetHover();
      return;
    }

    const fill = fillRef.current;
    const label = labelRef.current;
    if (!fill) return;

    fillTweenRef.current?.kill();
    textTweenRef.current?.kill();

    if (prefersReducedMotion()) {
      gsap.set(fill, { scale: 0, opacity: 0 });
      if (label) gsap.set(label, { color: defaultColor });
      return;
    }

    fillTweenRef.current = gsap.to(fill, {
      scale: 0,
      opacity: 0,
      duration: leaveDuration,
      ease: "power2.inOut",
    });

    if (label) {
      textTweenRef.current = gsap.to(label, {
        color: defaultColor,
        duration: leaveDuration * 0.75,
        ease: "power2.out",
      });
    }
  }, [defaultColor, enabled, leaveDuration, resetHover]);

  return {
    containerRef,
    fillRef,
    labelRef,
    onMouseEnter,
    onMouseLeave,
    resetHover,
  };
}
