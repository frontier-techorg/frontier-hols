"use client";

import { PeriodTabs } from "@/components/platform/provider/charts/PeriodTabs";
import { SalesLineChart, SalesPieChart } from "@/components/platform/provider/charts/SalesCharts";
import {
  type DashboardPeriod,
  type AffiliateDashboard,
  type AffiliateWallet,
} from "@/lib/integrate/provider/affiliate/dashboard";
import { emptySalesSnapshot, type SalesSnapshot } from "@/lib/integrate/provider/admin/sales/api";
import { planLabels } from "@/lib/integrate/provider/student/payment/types";

export { PeriodTabs } from "@/components/platform/provider/charts/PeriodTabs";

const COLORS = {
  earnings: "var(--sales-earnings)",
  monthly: "var(--sales-monthly)",
  biannual: "var(--sales-biannual)",
  annual: "var(--sales-annual)",
  available: "var(--sales-earnings)",
  locked: "var(--sales-monthly)",
  pending: "var(--sales-biannual)",
  paid: "var(--sales-sales)",
};

function shortLabel(label: string, period: DashboardPeriod) {
  if (period === "yearly") return label;
  if (period === "monthly") return label.split(" ")[0] ?? label;
  return label.split("–")[0]?.trim() ?? label;
}

function periodCaption(period: DashboardPeriod) {
  if (period === "monthly") return "This month";
  if (period === "yearly") return "This year";
  return "This week";
}

function planSlices(snapshot?: SalesSnapshot | null) {
  const row = snapshot ?? emptySalesSnapshot();
  return [
    { label: planLabels.monthly, amount: row.plan_monthly_revenue, color: COLORS.monthly },
    { label: planLabels.biannual, amount: row.plan_biannual_revenue, color: COLORS.biannual },
    { label: planLabels.annual, amount: row.plan_annual_revenue, color: COLORS.annual },
  ];
}

export function walletPieSlices(wallet?: AffiliateWallet | null) {
  return [
    { label: "Available", value: wallet?.available ?? 0, color: COLORS.available },
    { label: "Locked", value: wallet?.lock_amount ?? 0, color: COLORS.locked },
    { label: "Pending", value: wallet?.pending ?? 0, color: COLORS.pending },
    { label: "Paid out", value: wallet?.paid_out ?? 0, color: COLORS.paid },
  ];
}

export function AffiliateEarningsChart({
  dashboard,
  period,
  onPeriodChange,
  loading,
}: {
  dashboard: AffiliateDashboard | null;
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
  loading?: boolean;
}) {
  const series = dashboard?.timeseries.series ?? [];
  const labels = series.map((row) => shortLabel(row.label, period));

  return (
    <SalesLineChart
      caption="Time series"
      title="Earnings"
      money
      fill
      labels={labels}
      headerRight={<PeriodTabs period={period} onChange={onPeriodChange} disabled={loading} label="Earnings period" />}
      series={[
        {
          key: "earnings",
          label: "Commission",
          color: COLORS.earnings,
          values: series.map((row) => row.earnings),
        },
      ]}
    />
  );
}

export function AffiliatePlanMixPie({
  dashboard,
  period,
}: {
  dashboard: AffiliateDashboard | null;
  period: DashboardPeriod;
}) {
  const current = dashboard?.timeseries.current;
  const totals = dashboard?.totals;
  const useCurrent = Boolean(current && (current.sales_count > 0 || current.earnings > 0));
  const plans = planSlices(useCurrent ? current : totals);

  return (
    <SalesPieChart
      caption="Plan mix"
      title={useCurrent ? `${periodCaption(period)} volume` : "All-time volume"}
      money
      slices={plans.map((slice) => ({
        label: slice.label,
        value: slice.amount,
        color: slice.color,
      }))}
    />
  );
}

export function AffiliateWalletPie({
  wallet,
  variant = "card",
}: {
  wallet?: AffiliateWallet | null;
  variant?: "card" | "plain";
}) {
  return (
    <SalesPieChart
      caption="Wallet"
      title="Available, locked, paid"
      money
      size={variant === "plain" ? "sm" : "md"}
      variant={variant}
      centerLabel="Wallet"
      slices={walletPieSlices(wallet)}
    />
  );
}
