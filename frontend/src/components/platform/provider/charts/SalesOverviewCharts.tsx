"use client";

import { useState } from "react";
import {
  PeriodTabs,
  periodCaption,
  shortPeriodLabel,
  type ChartPeriod,
} from "@/components/platform/provider/charts/PeriodTabs";
import {
  SalesLineChart,
  SalesMetricGrid,
  SalesPieChart,
} from "@/components/platform/provider/charts/SalesCharts";
import { DashboardRecentActivity } from "@/components/platform/provider/admin/dashboard/DashboardRecentActivity";
import {
  dashboardCountMetrics,
  dashboardPayoutMetrics,
  dashboardRevenueMetrics,
} from "@/components/platform/provider/admin/finance/AdminFinanceOverview";
import {
  alignSalesPeriods,
  emptyAdminFinance,
  lastMonthKeys,
  lastWeekKeys,
  lastYearKeys,
  type SalesOverview,
  type SalesSnapshot,
} from "@/lib/integrate/provider/admin/sales";
import { planLabels } from "@/lib/integrate/provider/student/payment/types";

const COLORS = {
  revenue: "var(--sales-revenue)",
  profit: "var(--sales-profit)",
  monthly: "var(--sales-monthly)",
  biannual: "var(--sales-biannual)",
  annual: "var(--sales-annual)",
  direct: "var(--sales-direct)",
  referred: "var(--sales-referred)",
  affiliate: "var(--sales-affiliate)",
};

function seriesForPeriod(overview: SalesOverview, period: ChartPeriod) {
  const currency = overview.currency || "USD";
  if (period === "monthly") return alignSalesPeriods(overview.months, lastMonthKeys(12), currency);
  if (period === "yearly") return alignSalesPeriods(overview.years, lastYearKeys(5), currency);
  return alignSalesPeriods(overview.weeks, lastWeekKeys(8), currency);
}

function hasActivity(row?: SalesSnapshot | null) {
  return Boolean(row && (row.sales_count > 0 || row.revenue > 0 || row.profit > 0));
}

export function AdminDashboardCharts({ overview }: { overview: SalesOverview }) {
  const [period, setPeriod] = useState<ChartPeriod>("weekly");
  const currency = overview.currency || "USD";
  const totals = overview.totals;
  const finance = overview.finance ?? emptyAdminFinance(currency);
  const rows = seriesForPeriod(overview, period);
  const current = rows[rows.length - 1];
  const pieSource = hasActivity(current) ? current : totals;
  const pieTitle = hasActivity(current) ? `${periodCaption(period)} volume` : "All-time volume";

  return (
    <>
      <SalesMetricGrid items={dashboardCountMetrics(finance)} />
      <SalesMetricGrid items={dashboardRevenueMetrics(finance, currency)} />
      <SalesMetricGrid items={dashboardPayoutMetrics(finance, currency)} />

      <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] xl:items-stretch">
        <div className="flex min-h-0 min-w-0 flex-col gap-3 sm:gap-4">
          <SalesLineChart
            caption="Time series"
            title="Revenue and profit"
            money
            emptyLabel="No sales in this range yet."
            labels={rows.map((row) => shortPeriodLabel(row.label, period))}
            headerRight={<PeriodTabs period={period} onChange={setPeriod} label="Sales period" />}
            series={[
              {
                key: "revenue",
                label: "Revenue",
                color: COLORS.revenue,
                values: rows.map((row) => row.revenue),
              },
              {
                key: "profit",
                label: "Profit",
                color: COLORS.profit,
                values: rows.map((row) => row.profit),
              },
            ]}
          />
          <DashboardRecentActivity />
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-1">
          <SalesPieChart
            caption="Plan mix"
            title={pieTitle}
            money
            slices={[
              { label: planLabels.monthly, value: pieSource.plan_monthly_revenue, color: COLORS.monthly },
              { label: planLabels.biannual, value: pieSource.plan_biannual_revenue, color: COLORS.biannual },
              { label: planLabels.annual, value: pieSource.plan_annual_revenue, color: COLORS.annual },
            ]}
          />
          <SalesPieChart
            caption="Split"
            title="Profit vs affiliate"
            money
            slices={[
              { label: "Profit", value: pieSource.profit, color: COLORS.profit },
              { label: "Affiliate earnings", value: pieSource.affiliate_earnings, color: COLORS.affiliate },
            ]}
          />
          <SalesPieChart
            caption="Source"
            title="Direct vs referred"
            money
            slices={[
              { label: "Direct", value: pieSource.direct_revenue, color: COLORS.direct },
              { label: "Affiliate referred", value: pieSource.referred_revenue, color: COLORS.referred },
            ]}
          />
        </div>
      </div>
    </>
  );
}
