"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/integrate/provider/student/payment/types";
import { cn } from "@/lib/utils";

export type ChartSlice = {
  label: string;
  value: number;
  color: string;
};

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

function compactNumber(value: number, money = false) {
  const abs = Math.abs(value);
  if (money) {
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    return formatMoney(value);
  }
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const;
}

function donutPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
) {
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = polar(cx, cy, outer, start);
  const [x2, y2] = polar(cx, cy, outer, end);
  const [x3, y3] = polar(cx, cy, inner, end);
  const [x4, y4] = polar(cx, cy, inner, start);
  return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
}

function metricGridClass(count: number) {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-3";
  return "grid-cols-2 md:grid-cols-4";
}

function shouldShowAxisLabel(index: number, count: number) {
  if (count <= 6) return true;
  if (index === 0 || index === count - 1) return true;
  const step = Math.ceil((count - 1) / 4);
  return index % step === 0 && count - 1 - index >= step;
}

export function SalesMetricGrid({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string; href?: string }>;
}) {
  return (
    <div className={cn("grid min-w-0 gap-2.5 sm:gap-3", metricGridClass(items.length))}>
      {items.map((item) => {
        const content = (
          <>
            <p className="text-brand-caption font-medium leading-snug text-[color:var(--dash-faint)]">{item.label}</p>
            <p className="font-sans mt-1 break-words text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] tabular-nums sm:text-xl md:text-2xl">
              {item.value}
            </p>
            {item.hint ? (
              <p className="text-brand-caption mt-0.5 hidden text-[color:var(--dash-dim)] md:line-clamp-2 md:block">
                {item.hint}
              </p>
            ) : null}
          </>
        );
        const className =
          "dashboard-glass-card min-h-11 min-w-0 overflow-hidden rounded-2xl px-2.5 py-2.5 sm:px-3.5 sm:py-3 md:px-4 md:py-4";
        if (item.href) {
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                className,
                "block outline-none transition hover:bg-[color:var(--sidebar-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--dash-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
              )}
            >
              {content}
            </Link>
          );
        }
        return (
          <div key={item.label} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function SalesBarChart({
  title,
  caption,
  labels,
  series,
  money = false,
}: {
  title: string;
  caption?: string;
  labels: string[];
  series: ChartSeries[];
  money?: boolean;
}) {
  const width = 640;
  const height = 248;
  const pad = { top: 16, right: 12, bottom: 36, left: 48 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const rawMax = Math.max(0, ...series.flatMap((item) => item.values));
  const maxValue = rawMax > 0 ? rawMax : 1;
  const groupCount = Math.max(labels.length, 1);
  const groupWidth = innerWidth / groupCount;
  const barCount = Math.max(series.length, 1);
  const barWidth = Math.max(6, Math.min(22, (groupWidth - 10) / (barCount + 0.35)));
  const empty = series.every((item) => item.values.every((value) => value <= 0));

  return (
    <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl p-3.5 sm:p-5">
      <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
        {caption ?? "Trend"}
      </p>
      <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
        {title}
      </h2>
      {empty ? (
        <p className="text-brand-body mt-6 text-sm text-[color:var(--dash-muted)]">No payments in this range yet.</p>
      ) : (
        <>
          <div className="mt-4 min-w-0">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="sales-chart h-[12.5rem] w-full max-w-full sm:h-60"
              role="img"
              aria-label={title}
            >
              {[0, 0.5, 1].map((tick) => {
                const y = pad.top + innerHeight * (1 - tick);
                return (
                  <g key={tick}>
                    <line
                      x1={pad.left}
                      x2={width - pad.right}
                      y1={y}
                      y2={y}
                      className="sales-chart-grid"
                    />
                    <text x={pad.left - 8} y={y + 4} textAnchor="end" className="sales-chart-axis">
                      {compactNumber(maxValue * tick, money)}
                    </text>
                  </g>
                );
              })}
              {labels.map((label, index) => {
                const groupX = pad.left + groupWidth * index + groupWidth / 2;
                return (
                  <g key={`${label}-${index}`}>
                    {series.map((item, seriesIndex) => {
                      const value = item.values[index] ?? 0;
                      const barHeight = (value / maxValue) * innerHeight;
                      const x =
                        groupX -
                        (barCount * barWidth + (barCount - 1) * 4) / 2 +
                        seriesIndex * (barWidth + 4);
                      const y = pad.top + innerHeight - barHeight;
                      return (
                        <rect
                          key={item.key}
                          x={x}
                          y={y}
                          width={barWidth}
                          height={Math.max(barHeight, value > 0 ? 2 : 0)}
                          rx={4}
                          fill={item.color}
                        >
                          <title>{`${item.label}: ${money ? formatMoney(value) : value}`}</title>
                        </rect>
                      );
                    })}
                    {shouldShowAxisLabel(index, groupCount) ? (
                      <text
                        x={groupX}
                        y={height - 12}
                        textAnchor="middle"
                        className="sales-chart-axis"
                      >
                        {label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {series.map((item) => (
              <li key={item.key} className="text-brand-caption flex items-center gap-1.5 text-[color:var(--dash-muted)]">
                <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function EmptyChartState({ label, fill = false }: { label: string; fill?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        fill ? "absolute inset-0" : "mt-4 min-h-64 sm:min-h-72",
      )}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--dash-soft)] text-[color:var(--dash-muted)]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 19h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M4 19V5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path
            d="M7.5 14.5 11 10l3 2.5L18.5 7"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="font-sans text-sm font-medium text-[color:var(--dash-muted)]">{label}</p>
    </div>
  );
}

export function SalesLineChart({
  title,
  caption,
  labels,
  series,
  money = false,
  headerRight,
  emptyLabel = "No earnings in this range yet.",
  fill = false,
}: {
  title: string;
  caption?: string;
  labels: string[];
  series: ChartSeries[];
  money?: boolean;
  headerRight?: ReactNode;
  emptyLabel?: string;
  fill?: boolean;
}) {
  const width = 640;
  const height = 360;
  const pad = { top: 20, right: 22, bottom: 40, left: 48 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const rawMax = Math.max(0, ...series.flatMap((item) => item.values));
  const maxValue = rawMax > 0 ? rawMax : 1;
  const count = Math.max(labels.length, 1);
  const empty = series.every((item) => item.values.every((value) => value <= 0));

  function xFor(index: number) {
    if (count <= 1) return pad.left + innerWidth / 2;
    return pad.left + (index / (count - 1)) * innerWidth;
  }

  function yFor(value: number) {
    return pad.top + innerHeight * (1 - value / maxValue);
  }

  function linePath(values: number[]) {
    return values
      .map((value, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(value)}`)
      .join(" ");
  }

  function areaPath(values: number[]) {
    if (values.length === 0) return "";
    const top = linePath(values);
    const lastX = xFor(values.length - 1);
    const firstX = xFor(0);
    const bottom = pad.top + innerHeight;
    return `${top} L ${lastX} ${bottom} L ${firstX} ${bottom} Z`;
  }

  return (
    <section
      className={cn(
        "dashboard-glass-card min-w-0 overflow-hidden rounded-2xl p-3.5 sm:p-5",
        fill && "flex h-full min-h-0 flex-col",
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
            {caption ?? "Time series"}
          </p>
          <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
            {title}
          </h2>
        </div>
        {headerRight ? <div className="min-w-0 w-full sm:w-auto">{headerRight}</div> : null}
      </div>
      {empty ? (
        fill ? (
          <div className="relative mt-4 min-h-48 flex-1 sm:min-h-56">
            <EmptyChartState label={emptyLabel} fill />
          </div>
        ) : (
          <EmptyChartState label={emptyLabel} />
        )
      ) : (
        <>
          <div className={cn("mt-4 min-w-0", fill ? "relative min-h-48 flex-1 sm:min-h-56" : undefined)}>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              className={cn(
                "sales-chart block w-full max-w-full",
                fill ? "absolute inset-0 h-full" : "h-64 sm:h-72",
              )}
              role="img"
              aria-label={title}
            >
              {[0, 0.5, 1].map((tick) => {
                const y = pad.top + innerHeight * (1 - tick);
                return (
                  <g key={tick}>
                    <line
                      x1={pad.left}
                      x2={width - pad.right}
                      y1={y}
                      y2={y}
                      className="sales-chart-grid"
                    />
                    <text x={pad.left - 8} y={y + 4} textAnchor="end" className="sales-chart-axis">
                      {compactNumber(maxValue * tick, money)}
                    </text>
                  </g>
                );
              })}
              {series.map((item, seriesIndex) => (
                <g key={item.key}>
                  {seriesIndex === 0 ? (
                    <path d={areaPath(item.values)} fill={item.color} opacity={0.16} />
                  ) : null}
                  <path d={linePath(item.values)} className="sales-chart-line" stroke={item.color} />
                  {item.values.map((value, index) => (
                    <circle
                      key={`${item.key}-${index}`}
                      cx={xFor(index)}
                      cy={yFor(value)}
                      r={count > 16 ? 2.5 : 3.5}
                      fill={item.color}
                      className="sales-chart-point"
                    >
                      <title>{`${labels[index] ?? ""} · ${item.label}: ${money ? formatMoney(value) : value}`}</title>
                    </circle>
                  ))}
                </g>
              ))}
              {labels.map((label, index) =>
                shouldShowAxisLabel(index, count) ? (
                  <text
                    key={`${label}-${index}`}
                    x={xFor(index)}
                    y={height - 12}
                    textAnchor={index === 0 ? "start" : index === count - 1 ? "end" : "middle"}
                    className="sales-chart-axis"
                  >
                    {label}
                  </text>
                ) : null,
              )}
            </svg>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {series.map((item) => (
              <li key={item.key} className="text-brand-caption flex items-center gap-1.5 text-[color:var(--dash-muted)]">
                <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function SalesPieChart({
  title,
  caption,
  slices,
  money = false,
  variant = "card",
  size = "md",
  centerLabel = "Total",
}: {
  title: string;
  caption?: string;
  slices: ChartSlice[];
  money?: boolean;
  variant?: "card" | "plain";
  size?: "md" | "sm";
  centerLabel?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + Math.max(slice.value, 0), 0);
  const cx = 120;
  const cy = 120;
  const outer = 88;
  const inner = 52;
  let angle = -Math.PI / 2;
  const chart = (
    <div
      className={cn(
        "flex min-w-0",
        variant === "plain"
          ? "flex-col items-center gap-3"
          : "flex-col items-center gap-4 @[20rem]:flex-row @[20rem]:items-center",
      )}
    >
      <svg
        viewBox="0 0 240 240"
        className={cn("sales-chart shrink-0", size === "sm" ? "h-28 w-28 sm:h-32 sm:w-32" : "h-36 w-36 sm:h-44 sm:w-44")}
        role="img"
        aria-label={title}
      >
        {total <= 0 ? (
          <circle cx={cx} cy={cy} r={outer} className="sales-chart-empty" />
        ) : (
          slices.map((slice) => {
            if (slice.value <= 0) return null;
            const fraction = slice.value / total;
            if (fraction >= 0.999) {
              return (
                <g key={slice.label}>
                  <path
                    d={donutPath(cx, cy, outer, inner, -Math.PI / 2, Math.PI / 2)}
                    fill={slice.color}
                  />
                  <path
                    d={donutPath(cx, cy, outer, inner, Math.PI / 2, (3 * Math.PI) / 2)}
                    fill={slice.color}
                  />
                  <title>{`${slice.label}: ${money ? formatMoney(slice.value) : slice.value}`}</title>
                </g>
              );
            }
            const start = angle;
            const end = angle + fraction * Math.PI * 2;
            angle = end;
            return (
              <path key={slice.label} d={donutPath(cx, cy, outer, inner, start, end)} fill={slice.color}>
                <title>{`${slice.label}: ${money ? formatMoney(slice.value) : slice.value}`}</title>
              </path>
            );
          })
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" className="sales-chart-center-value">
          {money ? compactNumber(total, true) : compactNumber(total)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="sales-chart-center-label">
          {centerLabel}
        </text>
      </svg>
      {variant === "plain" ? null : (
        <ul className="grid w-full min-w-0 flex-1 gap-2 @[20rem]:w-auto">
          {slices.map((slice) => (
            <li key={slice.label} className="flex min-w-0 items-center justify-between gap-3">
              <span className="text-brand-caption flex min-w-0 items-center gap-2 text-[color:var(--dash-muted)]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
                <span className="truncate">{slice.label}</span>
              </span>
              <span className="font-sans shrink-0 text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                {money ? formatMoney(slice.value) : slice.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (variant === "plain") {
    return chart;
  }

  return (
    <section className="dashboard-glass-card @container min-w-0 overflow-hidden rounded-2xl p-3.5 sm:p-5">
      <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
        {caption ?? "Mix"}
      </p>
      <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
        {title}
      </h2>
      <div className="mt-4 min-w-0">{chart}</div>
    </section>
  );
}
