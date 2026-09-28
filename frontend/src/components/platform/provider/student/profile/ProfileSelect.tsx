"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type ProfileSelectOption = {
  value: string;
  label: string;
};

type ProfileSelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: ProfileSelectOption[];
  /** Keep the label for screen readers when the control sits in a toolbar. */
  hideLabel?: boolean;
  className?: string;
  /** Shown on the closed control when nothing is chosen. Not listed in the menu. */
  placeholder?: string;
  /** Paint the menu above dialogs that sit on document.body. */
  portalToBody?: boolean;
  menuZIndex?: number;
};

export function ProfileSelect({
  id,
  label,
  value,
  onChange,
  disabled,
  options,
  hideLabel = false,
  className,
  placeholder,
  portalToBody = false,
  menuZIndex = 120,
}: ProfileSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuBox, setMenuBox] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const matched = options.find((option) => option.value === value);
  const selected = matched ?? (placeholder ? undefined : options[0]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuBox(null);
      return;
    }

    const shell = buttonRef.current.closest(".portal-shell") as HTMLElement | null;
    setPortalTarget(portalToBody ? document.body : (shell ?? document.body));

    function updatePosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = 6;
      const margin = 8;
      const preferred = 256;
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const openUp = below < 160 && above > below;
      const maxHeight = Math.max(120, Math.min(preferred, (openUp ? above : below) - gap));
      setMenuBox({
        top: openUp ? undefined : rect.bottom + gap,
        bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, portalToBody]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    const menu = menuRef.current;
    const item = menu?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (!menu || !item) return;
    const menuRect = menu.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < menuRect.top) menu.scrollTop -= menuRect.top - itemRect.top;
    else if (itemRect.bottom > menuRect.bottom) menu.scrollTop += itemRect.bottom - menuRect.bottom;
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const next =
          event.key === "ArrowDown"
            ? Math.min(options.length - 1, activeIndex + 1)
            : Math.max(0, activeIndex - 1);
        setActiveIndex(next);
        const menu = menuRef.current;
        const item = menu?.querySelector<HTMLElement>(`[data-index="${next}"]`);
        if (menu && item) {
          const menuRect = menu.getBoundingClientRect();
          const itemRect = item.getBoundingClientRect();
          if (itemRect.top < menuRect.top) menu.scrollTop -= menuRect.top - itemRect.top;
          else if (itemRect.bottom > menuRect.bottom) menu.scrollTop += itemRect.bottom - menuRect.bottom;
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const option = options[activeIndex];
        if (!option) return;
        onChange(option.value);
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, onChange, open, options]);

  const menu =
    open && menuBox && portalTarget
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className={cn(
              "profile-select-menu",
              rootRef.current?.closest(".webinars-page, .orders-page") && "webinar-select-menu",
            )}
            style={{
              position: "fixed",
              top: menuBox.top,
              bottom: menuBox.bottom,
              left: menuBox.left,
              width: menuBox.width,
              maxHeight: menuBox.maxHeight,
              zIndex: menuZIndex,
            }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li key={`${option.value}-${option.label}`} role="presentation">
                  <button
                    type="button"
                    role="option"
                    data-index={index}
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    className={cn(
                      "profile-select-option",
                      isSelected && "is-selected",
                      index === activeIndex && "is-active",
                    )}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>,
          portalTarget,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("profile-select grid min-w-0 gap-2", hideLabel && "gap-0", className)}>
      <label id={`${id}-label`} htmlFor={id} className={cn("dashboard-field-label", hideLabel && "sr-only")}>
        {label}
      </label>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        className={cn(
          "dashboard-field dashboard-field-select block h-10 min-h-10 w-full min-w-0 max-w-full truncate text-left text-sm",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {selected?.label ?? placeholder ?? "Select"}
      </button>
      {menu}
    </div>
  );
}
