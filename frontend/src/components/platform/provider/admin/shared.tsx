"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Icon } from "@/components/icons";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type PaginationControlsProps = {
  page: number;
  pageCount?: number;
  hasNext: boolean;
  hasPrevious: boolean;
  total: number;
  loading?: boolean;
  compact?: boolean;
  /** Lecture-style pager: no divider, navy Previous, yellow Next. */
  appearance?: "default" | "lecture";
  onPrevious: () => void;
  onNext: () => void;
};

export function PaginationControls({
  page,
  pageCount,
  hasNext,
  hasPrevious,
  total,
  loading,
  compact,
  appearance = "default",
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  const lecture = appearance === "lecture";
  const previousDisabled = !hasPrevious || loading;
  const nextDisabled = !hasNext || loading;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        lecture
          ? "mt-4"
          : compact
            ? "pt-1"
            : "mt-5 border-t border-[color:var(--dash-surface-border)] pt-4",
      )}
    >
      <p className="text-brand-caption text-[color:var(--dash-faint)]">
        {total} total · Page {page}
        {pageCount ? ` of ${pageCount}` : ""}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
        {lecture ? (
          <>
            <button
              type="button"
              disabled={previousDisabled}
              onClick={onPrevious}
              className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
            >
              <SidebarSvgIcon name="previous" size={16} />
              <span className="sm:hidden">Prev</span>
              <span className="hidden sm:inline">Previous page</span>
            </button>
            <Button
              type="button"
              disabled={nextDisabled}
              onClick={onNext}
              className="lecture-page-action w-full px-5 sm:w-auto"
            >
              <span className="sm:hidden">Next</span>
              <span className="hidden sm:inline">Next page</span>
              <SidebarSvgIcon name="next" size={16} />
            </Button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={previousDisabled}
              onClick={onPrevious}
              className="dashboard-pill-soft font-sans inline-flex min-h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-[color:var(--dash-text)] transition disabled:pointer-events-none disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={nextDisabled}
              onClick={onNext}
              className="dashboard-pill-soft font-sans inline-flex min-h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-[color:var(--dash-text)] transition disabled:pointer-events-none disabled:opacity-50"
            >
              Next
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function DirectoryNativeSelect({
  id,
  label,
  value,
  onChange,
  options,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 w-full flex-1 sm:w-[9.75rem] sm:flex-none sm:shrink-0", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="dashboard-field dashboard-field-select dashboard-toolbar-field"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DirectoryFilterPills<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="flex w-full min-w-0 shrink-0 flex-wrap gap-1 rounded-full bg-[color:var(--dash-surface)] p-1 sm:w-auto"
      role="group"
      aria-label={label}
    >
      {options.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "font-sans inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-sm font-medium tracking-[0.01em] transition sm:min-h-10 sm:flex-none sm:px-4",
              active
                ? "dashboard-navy-btn text-white"
                : "text-[color:var(--dash-muted)] hover:text-[color:var(--dash-text)]",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function UserLink({ userId, label }: { userId: string; label: string }) {
  return (
    <Link
      href={`/admin/users/${encodeURIComponent(userId)}`}
      className="font-sans font-semibold text-[color:var(--dash-text)] underline-offset-2 transition hover:text-[color:var(--dash-accent)] hover:underline"
    >
      {label}
    </Link>
  );
}

export function StatPill({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl px-3.5 py-3 sm:px-4 sm:py-4">
      <p className="text-brand-caption break-words font-medium text-[color:var(--dash-faint)]">{label}</p>
      <p className="font-sans mt-1 break-words text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl">
        {value}
      </p>
    </div>
  );
}

/** Labeled data cell used inside user directory cards. */
export function DataField({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 overflow-hidden", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
        {label}
      </p>
      <div className="font-sans mt-1 break-words text-sm font-medium text-[color:var(--dash-text)] [overflow-wrap:anywhere]">
        {value ?? "—"}
      </div>
    </div>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "warn" | "muted";
}) {
  const toneClass =
    tone === "accent"
      ? "bg-[#DDE466]/25 text-[color:var(--dash-accent)]"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-700"
        : tone === "muted"
          ? "bg-[color:var(--dash-soft)] text-[color:var(--dash-faint)]"
          : "bg-[color:var(--dash-soft)] text-[color:var(--dash-muted)]";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClass}`}
    >
      {children}
    </span>
  );
}

/** Custom select so open menu matches portal dark/light field styles (native `<option>` cannot). */
export function DashboardSelect<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
  id,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  "aria-label"?: string;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const [portalTheme, setPortalTheme] = useState<"light" | "dark">("light");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];
  const isDark = portalTheme === "dark";

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuBox(null);
      return;
    }

    const shell = buttonRef.current.closest(".portal-shell") as HTMLElement | null;
    setPortalTarget(shell ?? document.body);
    setPortalTheme(shell?.getAttribute("data-theme") === "dark" ? "dark" : "light");

    function updatePosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuBox({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menu =
    open && menuBox && portalTarget
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            data-theme={portalTheme}
            className="dashboard-select-menu overflow-hidden rounded-2xl p-1.5"
            style={{
              position: "fixed",
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
              zIndex: 9999,
              backgroundColor: isDark ? "rgba(16, 30, 54, 0.97)" : "rgba(244, 247, 251, 0.97)",
              backgroundImage: isDark
                ? "linear-gradient(165deg, rgba(56, 83, 164, 0.45) 0%, rgba(20, 38, 68, 0.25) 100%)"
                : "linear-gradient(165deg, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.3) 100%)",
              border: isDark
                ? "1px solid rgba(141, 195, 225, 0.4)"
                : "1px solid rgba(21, 39, 68, 0.14)",
              color: isDark ? "#f4f7fb" : "#152744",
              backdropFilter: "blur(28px) saturate(170%)",
              WebkitBackdropFilter: "blur(28px) saturate(170%)",
              boxShadow: isDark
                ? "inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 18px 48px rgba(0, 0, 0, 0.55)"
                : "inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 18px 48px rgba(10, 18, 36, 0.22)",
            }}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "font-sans flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm transition",
                      isSelected
                        ? "bg-[#DDE466]/28 font-semibold"
                        : isDark
                          ? "text-white/70 hover:bg-white/10 hover:text-white"
                          : "text-[#152744]/70 hover:bg-[#152744]/6 hover:text-[#152744]",
                      isSelected && (isDark ? "text-white" : "text-[#152744]"),
                    )}
                  >
                    <span>{option.label}</span>
                    {isSelected ? (
                      <Icon
                        icon={Check}
                        size={15}
                        strokeWidth={2.2}
                        className="shrink-0 text-[#DDE466]"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>,
          portalTarget,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        className="dashboard-field font-sans flex w-full items-center justify-between gap-2 pr-3.5 text-left"
      >
        <span className="min-w-0 truncate">{selected?.label ?? "Select"}</span>
        <Icon
          icon={ChevronDown}
          size={16}
          strokeWidth={2}
          className={cn(
            "shrink-0 text-[color:var(--dash-accent)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {menu}
    </div>
  );
}

export function DirectorySearchBar({
  value,
  onChange,
  placeholder,
  label = "Search directory",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "lecture-library-search lecture-library-search--toolbar",
        className ?? "mt-4 sm:mt-5",
      )}
    >
      <span className="lecture-library-search-icon" aria-hidden>
        <SidebarSvgIcon name="search" size={18} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="hols-plain-control lecture-library-search-input"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="lecture-library-search-clear"
          aria-label="Clear search"
        >
          <SidebarSvgIcon name="cross" size={14} />
        </button>
      ) : null}
    </label>
  );
}

export function DirectoryMobileRow({
  title,
  subtitle,
  avatar,
  active,
  onClick,
  ariaLabel,
  stats,
  wrapSubtitle = false,
}: {
  title: string;
  subtitle?: string;
  avatar?: string;
  active?: boolean;
  onClick: () => void;
  ariaLabel: string;
  stats: Array<{ label: string; value: ReactNode }>;
  wrapSubtitle?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex w-full min-w-0 flex-col gap-3.5 overflow-hidden rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4 text-left transition",
        active && "ring-1 ring-[color:var(--dash-surface-border)]",
      )}
    >
      <div className={cn("flex min-w-0 gap-3 overflow-hidden", wrapSubtitle ? "items-start" : "items-center")}>
        {avatar ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--dash-surface)] font-sans text-xs font-bold text-[color:var(--dash-text)]">
            {avatar}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="font-sans block truncate text-sm font-semibold text-[color:var(--dash-text)]">
            {title}
          </span>
          {subtitle ? (
            <span
              className={cn(
                "text-brand-caption mt-0.5 block text-[color:var(--dash-faint)]",
                wrapSubtitle ? "text-pretty break-words whitespace-normal" : "truncate",
              )}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[color:var(--dash-accent)]"
          aria-hidden
        >
          <SidebarSvgIcon name="next" size={18} strokeWidth={2.2} />
        </span>
      </div>
      {stats.length > 0 ? (
        <dl
          className={cn(
            "grid min-w-0 gap-x-3 gap-y-2.5",
            stats.length === 3 ? "grid-cols-3" : "grid-cols-2",
          )}
        >
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="text-brand-caption text-[color:var(--dash-faint)]">{stat.label}</dt>
              <dd className="font-sans mt-0.5 min-w-0 truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </button>
  );
}

export function DirectoryListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)]/40 p-4 sm:p-5"
        >
          <div className="flex items-center gap-3">
            <span className="dashboard-skeleton-block h-12 w-12 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <span className="dashboard-skeleton-block block h-4 w-40 rounded-full" />
              <span className="dashboard-skeleton-block block h-3 w-56 rounded-full" />
            </div>
            <span className="dashboard-skeleton-block hidden h-9 w-24 rounded-full sm:block" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, field) => (
              <div key={field} className="space-y-2">
                <span className="dashboard-skeleton-block block h-2.5 w-14 rounded-full" />
                <span className="dashboard-skeleton-block block h-3.5 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
