"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlanType } from "@/lib/integrate/provider/student/payment/types";
import { cn } from "@/lib/utils";

type MembershipTermCalendarProps = {
  planType: PlanType | null;
  startDate: string;
  endDate: string;
  className?: string;
};

type DayCell = {
  key: string;
  date: Date;
  inTerm: boolean;
  status: "completed" | "today" | "remaining" | "outside";
};

type MonthCell = {
  key: string;
  year: number;
  month: number;
  label: string;
  shortLabel: string;
  status: "completed" | "current" | "upcoming" | "outside";
  daysCompleted: number;
  daysTotal: number;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

function startOfLocalDay(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function formatMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
    new Date(year, month, 1),
  );
}

function formatMonthShort(year: number, month: number, showYear: boolean) {
  const monthPart = new Intl.DateTimeFormat(undefined, { month: "short" }).format(
    new Date(year, month, 1),
  );
  if (!showYear) return monthPart;
  return `${monthPart} ’${String(year).slice(-2)}`;
}

function eachMonthBetween(start: Date, end: Date): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor.getTime() <= last.getTime()) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function buildMonthCells(start: Date, end: Date, today: Date): MonthCell[] {
  const spansYears = start.getFullYear() !== end.getFullYear();
  return eachMonthBetween(start, end).map(({ year, month }) => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const rangeStart = start.getTime() > monthStart.getTime() ? start : monthStart;
    const rangeEnd = end.getTime() < monthEnd.getTime() ? end : monthEnd;
    const dayMs = 86_400_000;
    const daysTotal = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / dayMs) + 1);

    let daysCompleted = 0;
    if (today.getTime() > rangeEnd.getTime()) {
      daysCompleted = daysTotal;
    } else if (today.getTime() >= rangeStart.getTime()) {
      daysCompleted = Math.min(
        daysTotal,
        Math.max(0, Math.round((today.getTime() - rangeStart.getTime()) / dayMs)),
      );
    }

    let status: MonthCell["status"] = "upcoming";
    if (today.getTime() > monthEnd.getTime() || daysCompleted >= daysTotal) {
      status = "completed";
    } else if (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getTime() >= start.getTime() &&
      today.getTime() <= end.getTime()
    ) {
      status = "current";
    } else if (today.getTime() < monthStart.getTime()) {
      status = "upcoming";
    } else if (today.getTime() > monthEnd.getTime()) {
      status = "completed";
    }

    return {
      key: monthKey(year, month),
      year,
      month,
      label: formatMonthLabel(year, month),
      shortLabel: formatMonthShort(year, month, spansYears),
      status,
      daysCompleted,
      daysTotal,
    };
  });
}

function buildDayCells(year: number, month: number, start: Date, end: Date, today: Date): DayCell[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = first.getDay();
  const cells: DayCell[] = [];

  for (let i = 0; i < lead; i += 1) {
    const date = new Date(year, month, i - lead + 1);
    cells.push({
      key: `pad-${year}-${month}-${i}`,
      date,
      inTerm: false,
      status: "outside",
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    const t = date.getTime();
    const inTerm = t >= start.getTime() && t <= end.getTime();
    let status: DayCell["status"] = "outside";
    if (inTerm) {
      if (t === today.getTime()) status = "today";
      else if (t < today.getTime()) status = "completed";
      else status = "remaining";
    }
    cells.push({
      key: `${monthKey(year, month)}-${day}`,
      date,
      inTerm,
      status,
    });
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]?.date ?? new Date(year, month + 1, 0);
    const date = new Date(last);
    date.setDate(date.getDate() + 1);
    cells.push({
      key: `trail-${year}-${month}-${cells.length}`,
      date,
      inTerm: false,
      status: "outside",
    });
  }

  return cells;
}

function defaultMonthKey(months: MonthCell[], today: Date): string | null {
  if (months.length === 0) return null;
  const current = months.find((m) => m.status === "current");
  if (current) return current.key;
  const containing = months.find(
    (m) => m.year === today.getFullYear() && m.month === today.getMonth(),
  );
  if (containing) return containing.key;
  const upcoming = months.find((m) => m.status === "upcoming");
  if (upcoming) return upcoming.key;
  return months[0]?.key ?? null;
}

export function MembershipTermCalendar({
  planType,
  startDate,
  endDate,
  className,
}: MembershipTermCalendarProps) {
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);
  const today = startOfLocalDay(new Date());

  const months = useMemo(() => {
    if (!start || !end || !today) return [];
    return buildMonthCells(start, end, today);
  }, [startDate, endDate]);

  const showMonthOverview = planType === "biannual" || planType === "annual";
  const preferredKey = today ? defaultMonthKey(months, today) : months[0]?.key ?? null;

  // Annual / biannual: start on month overview. Monthly: open day grid immediately.
  const [view, setView] = useState<"overview" | "days">(
    showMonthOverview ? "overview" : "days",
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(preferredKey);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeChipRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setView(showMonthOverview ? "overview" : "days");
    setSelectedKey(preferredKey);
  }, [planType, startDate, endDate, preferredKey, showMonthOverview]);

  const activeKey = selectedKey ?? preferredKey;
  const selectedMonth = months.find((m) => m.key === activeKey) ?? months[0] ?? null;
  const inDayView = !showMonthOverview || view === "days";

  const days = useMemo(() => {
    if (!start || !end || !today || !selectedMonth || !inDayView) return [];
    return buildDayCells(selectedMonth.year, selectedMonth.month, start, end, today);
  }, [selectedMonth?.key, startDate, endDate, inDayView]);

  useEffect(() => {
    if (!inDayView || !activeChipRef.current || !scrollerRef.current) return;
    activeChipRef.current.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeKey, inDayView]);

  function openMonth(key: string) {
    setSelectedKey(key);
    setView("days");
  }

  if (!start || !end || !today || months.length === 0) {
    return null;
  }

  return (
    <div className={cn("membership-term-calendar w-full rounded-xl px-2.5 py-2.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="font-sans min-w-0 truncate text-xs font-semibold text-[color:var(--dash-text)] sm:text-sm">
          {!inDayView ? "Select a month" : selectedMonth?.label ?? "This term"}
        </p>
        {showMonthOverview && inDayView ? (
          <button
            type="button"
            onClick={() => setView("overview")}
            className="text-brand-caption shrink-0 font-medium text-[color:var(--dash-muted)] transition hover:text-[color:var(--dash-text)]"
          >
            All months
          </button>
        ) : null}
      </div>

      {!inDayView ? (
        <div
          className={cn(
            "mt-2.5 grid gap-1.5",
            planType === "annual" ? "grid-cols-3" : "grid-cols-3",
          )}
        >
          {months.map((month) => {
            const isPreferred = month.key === preferredKey;
            return (
              <button
                key={month.key}
                type="button"
                onClick={() => openMonth(month.key)}
                className={cn(
                  "membership-cal-month rounded-xl px-2 py-2 text-left transition",
                  month.status === "completed" && "membership-cal-month--done",
                  month.status === "current" && "membership-cal-month--now",
                  month.status === "upcoming" && "membership-cal-month--next",
                  isPreferred && month.status !== "current" && "membership-cal-month--preferred",
                )}
              >
              <p
                className={cn(
                  "font-sans text-xs font-semibold",
                  month.status === "current" ? "text-[#142644]" : "text-[color:var(--dash-text)]",
                )}
              >
                {month.shortLabel}
              </p>
              <p
                className={cn(
                  "text-[10px] font-medium uppercase tracking-[0.06em]",
                  month.status === "current" ? "text-[#142644]/70" : "text-[color:var(--dash-faint)]",
                )}
              >
                {month.status === "completed"
                  ? "Done"
                  : month.status === "current"
                    ? "Now"
                    : isPreferred
                      ? "Start"
                      : "Next"}
              </p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-2">
          {months.length > 1 ? (
            <div ref={scrollerRef} className="membership-cal-scroller mb-2">
              <div className="membership-cal-scroller-track">
                {months.map((month) => {
                  const isActive = month.key === activeKey;
                  return (
                    <button
                      key={month.key}
                      ref={isActive ? activeChipRef : undefined}
                      type="button"
                      onClick={() => openMonth(month.key)}
                      className={cn(
                        "membership-cal-chip",
                        isActive && "membership-cal-chip--active",
                        !isActive && month.status === "completed" && "membership-cal-chip--done",
                        !isActive && month.status !== "completed" && "membership-cal-chip--idle",
                      )}
                    >
                      {month.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((day, index) => (
              <span
                key={`${day}-${index}`}
                className="text-center text-[9px] font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]"
              >
                {day}
              </span>
            ))}
            {days.map((cell) => (
              <span
                key={cell.key}
                title={
                  cell.inTerm
                    ? cell.date.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })
                    : undefined
                }
                className={cn(
                  "membership-cal-day flex aspect-square items-center justify-center rounded-md text-[10px] font-semibold tabular-nums",
                  cell.status === "completed" && "membership-cal-day--done",
                  cell.status === "today" && "membership-cal-day--today",
                  cell.status === "remaining" && "membership-cal-day--left",
                  cell.status === "outside" && "membership-cal-day--out",
                )}
              >
                {cell.date.getDate()}
              </span>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-[color:var(--dash-surface-border)] pt-2">
            <span className="inline-flex items-center gap-1 text-[10px] text-[color:var(--dash-muted)]">
              <span className="h-1.5 w-1.5 rounded-sm bg-[color:var(--dash-ring-done)]" />
              Done
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-[color:var(--dash-muted)]">
              <span className="h-1.5 w-1.5 rounded-sm bg-[#142644]" />
              Today
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-[color:var(--dash-muted)]">
              <span className="membership-progress-swatch-left h-1.5 w-1.5 rounded-sm bg-[color:var(--dash-ring-left)]" />
              Left
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
