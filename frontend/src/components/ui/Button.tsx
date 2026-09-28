"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSpreadHover } from "@/hooks/useSpreadHover";
import {
  buttonHoverSpread,
  getButtonClassName,
  type ButtonVariant,
  buttonSizes,
} from "@/lib/button-styles";
import { PORTAL_THEME_CHANGE_EVENT } from "@/components/platform/provider/portal-theme";
import { cn } from "@/lib/utils";

type ButtonProps = {
  href?: string;
  variant?: ButtonVariant;
  size?: keyof typeof buttonSizes;
  children: React.ReactNode;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
};

function readGlassRestColor(node: Element | null) {
  if (typeof document === "undefined") return "#142644";
  const shell = node?.closest(".portal-shell");
  return shell?.getAttribute("data-theme") === "dark" ? "#f4f7fb" : "#142644";
}

export function Button({
  href,
  variant = "primary",
  size = "md",
  children,
  className,
  type = "button",
  disabled = false,
  onClick,
}: ButtonProps) {
  const spread = buttonHoverSpread[variant];
  const [glassRest, setGlassRest] = useState("#142644");
  const defaultColor = variant === "glass" ? glassRest : spread.textDefault;
  const hoverColor = variant === "glass" ? "#142644" : spread.textHover;

  const { containerRef, fillRef, labelRef, onMouseEnter, onMouseLeave, resetHover } =
    useSpreadHover({
      fillColor: spread.fill,
      defaultColor,
      hoverColor,
      enabled: !disabled,
    });

  useEffect(() => {
    if (variant !== "glass") return;
    const sync = () => setGlassRest(readGlassRestColor(containerRef.current));
    sync();
    window.addEventListener(PORTAL_THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(PORTAL_THEME_CHANGE_EVENT, sync);
  }, [variant]);

  // Keep the resting yellow state whenever the control disables or remounts.
  useEffect(() => {
    resetHover();
  }, [disabled, resetHover]);

  const classes = getButtonClassName(
    variant,
    disabled ? cn("pointer-events-none opacity-45", className) : className,
    size,
  );

  const handleClick = () => {
    // Clear the navy fill before navigation/state changes so the next view
    // does not inherit a stuck blue button.
    resetHover();
    onClick?.();
  };

  const inner = (
    <>
      <span
        ref={fillRef}
        aria-hidden
        className="pointer-events-none absolute z-0 rounded-full will-change-transform"
      />
      <span
        ref={labelRef}
        className="relative z-10 inline-flex items-center justify-center gap-2"
        style={{ color: defaultColor }}
      >
        {children}
      </span>
    </>
  );

  if (href && !disabled) {
    return (
      <Link
        ref={containerRef as React.RefObject<HTMLAnchorElement>}
        href={href}
        onClick={handleClick}
        className={classes}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      ref={containerRef as React.RefObject<HTMLButtonElement>}
      type={type}
      disabled={disabled}
      onClick={disabled ? undefined : handleClick}
      className={classes}
      onMouseEnter={disabled ? undefined : onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {inner}
    </button>
  );
}
