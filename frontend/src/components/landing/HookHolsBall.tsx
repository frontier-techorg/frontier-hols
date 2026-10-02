"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { landingContent } from "@/content/landing";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const HOOK_PATH_SYNC = "hook-path-sync";
const PARALLAX_STRENGTH = 0.045;
const PARALLAX_MAX = 14;

type HookHolsBallProps = {
  innerRef?: (node: HTMLDivElement | null) => void;
  className?: string;
  /** Stack the HOLS wordmark in flow (mobile vertical diagram). Desktop keeps it out of flow. */
  labelInFlow?: boolean;
};

/** HOLS ball hub for the Hook section diagram — idle float + cursor parallax. */
export function HookHolsBall({ innerRef, className, labelInFlow = false }: HookHolsBallProps) {
  const { hook } = landingContent;
  const [reduceMotion, setReduceMotion] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const syncedRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (reduceMotion || labelInFlow) return;

    const clamp = (v: number) => Math.max(-PARALLAX_MAX, Math.min(PARALLAX_MAX, v));

    const tick = () => {
      const shell = shellRef.current;
      if (shell) {
        const cur = currentRef.current;
        const tgt = targetRef.current;
        cur.x += (tgt.x - cur.x) * 0.12;
        cur.y += (tgt.y - cur.y) * 0.12;
        shell.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;

        const synced = syncedRef.current;
        if (Math.hypot(cur.x - synced.x, cur.y - synced.y) > 0.4) {
          syncedRef.current = { x: cur.x, y: cur.y };
          window.dispatchEvent(new Event(HOOK_PATH_SYNC));
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      targetRef.current = {
        x: clamp(-dx * PARALLAX_STRENGTH),
        y: clamp(-dy * PARALLAX_STRENGTH),
      };
    };

    rafRef.current = requestAnimationFrame(tick);
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [reduceMotion, labelInFlow]);

  const setShellRef = useCallback(
    (node: HTMLDivElement | null) => {
      shellRef.current = node;
      innerRef?.(node);
    },
    [innerRef],
  );

  return (
    <div data-hook-hub className={cn("relative z-20 flex flex-col items-center", className)}>
      <div
        ref={setShellRef}
        data-hook-ball
        className="pointer-events-none relative flex aspect-square w-[150px] select-none items-center justify-center sm:w-[180px] md:w-[210px]"
      >
        <div
          className={cn(
            "relative h-full w-full",
            !reduceMotion && "hook-hols-ball-float",
          )}
        >
          <Image
            src="https://frontiercms.s3.us-east-1.amazonaws.com/ball_37de8c23c1.png"
            alt=""
            width={480}
            height={480}
            draggable={false}
            className="relative h-full w-full object-contain"
            sizes="(min-width: 768px) 210px, (min-width: 640px) 180px, 150px"
            priority
          />
        </div>
      </div>

      <div
        className={
          labelInFlow
            ? "pointer-events-none relative z-30 mt-3 w-max bg-[#E5E5E5] px-4 py-0.5 text-center"
            : "pointer-events-none absolute top-full left-1/2 z-30 mt-3 w-max -translate-x-1/2 text-center"
        }
      >
        <p className="font-sans text-lg font-bold tracking-[0.04em] text-primary">{hook.hubLabel}</p>
      </div>
    </div>
  );
}
