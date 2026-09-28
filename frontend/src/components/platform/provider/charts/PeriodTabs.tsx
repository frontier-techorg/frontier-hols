"use client";

import { cn } from "@/lib/utils";

export type ChartPeriod = "weekly" | "monthly" | "yearly";

export function shortPeriodLabel(label: string, period: ChartPeriod) {
  if (period === "yearly") return label;
  if (period === "monthly") return label.split(" ")[0] ?? label;
  return label.split("–")[0]?.trim() ?? label;
}

export function periodCaption(period: ChartPeriod) {
  if (period === "monthly") return "This month";
  if (period === "yearly") return "This year";
  return "This week";
}

const PERIODS: Array<{ id: ChartPeriod; label: string }> = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

export function PeriodTabs({
  period,
  onChange,
  disabled,
  label = "Period",
}: {
  period: ChartPeriod;
  onChange: (period: ChartPeriod) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div
      className="flex h-10 w-full shrink-0 items-center gap-1 sm:w-auto"
      role="tablist"
      aria-label={label}
    >
      {PERIODS.map((item) => {
        const active = item.id === period;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              "dashboard-page-action font-sans inline-flex h-10 min-h-10 max-h-10 flex-1 items-center justify-center rounded-full border border-transparent px-4 text-sm font-medium tracking-[0.01em] transition sm:flex-none",
              active
                ? "dashboard-navy-btn text-white"
                : "text-[color:var(--dash-muted)] hover:bg-[color:var(--sidebar-hover)] hover:text-[color:var(--dash-text)] disabled:opacity-50",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
