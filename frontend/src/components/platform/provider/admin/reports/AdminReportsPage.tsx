"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Icon, Menu } from "@/components/icons";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import {
  DataField,
  DirectoryMobileRow,
  PaginationControls,
  StatusBadge,
  UserLink,
} from "@/components/platform/provider/admin/shared";
import { adminNav } from "@/components/platform/provider/admin/adminNav";
import {
  FinanceOverviewCard,
  reportsFinanceMetrics,
} from "@/components/platform/provider/admin/finance/AdminFinanceOverview";
import { useAdminFinance } from "@/components/platform/provider/admin/finance/useAdminFinance";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { DashRightDrawer } from "@/components/platform/provider/student/DashRightDrawer";
import { getAccessToken } from "@/lib/integrate/auth/storage";
import { ApiRequestError, refreshAccessTokenForSession } from "@/lib/integrate/client";
import {
  downloadExcelCsv,
  exportStamp,
  type ExcelCell,
} from "@/lib/export/excelCsv";
import {
  downloadReportOrders,
  listReportOrders,
  type ReportDownloadProgress,
  type ReportOrderItem,
  type ReportOrderList,
} from "@/lib/integrate/provider/admin/reports";
import {
  formatDate,
  formatMoney,
  planLabels,
  type PlanType,
} from "@/lib/integrate/provider/student/payment/types";
import { cn } from "@/lib/utils";

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: isoDate(from), to: isoDate(to) };
}

function planLabel(plan?: string | null) {
  if (!plan) return "—";
  return planLabels[plan as PlanType] ?? plan;
}

function statusLabel(status?: string | null) {
  const value = (status || "pending").trim() || "pending";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusTone(status?: string | null): "accent" | "warn" | "muted" | "neutral" {
  const value = (status || "").toLowerCase();
  if (value === "paid" || value === "completed") return "accent";
  if (value === "failed" || value === "refunded") return "warn";
  if (value === "pending") return "muted";
  return "neutral";
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function personLabel(name?: string | null, email?: string | null, fallback = "—") {
  return name?.trim() || email?.trim() || fallback;
}

function reportFilename(from: string, to: string) {
  return exportStamp(`hols-orders-${from}-to-${to}`);
}

function downloadReportCsv(from: string, to: string, items: ReportOrderItem[]) {
  const headers = [
    "Order ID",
    "Created at",
    "Status",
    "Plan",
    "Amount",
    "Currency",
    "Student ID",
    "Student name",
    "Student email",
    "Affiliate ID",
    "Affiliate name",
    "Affiliate email",
    "Commission",
    "Profit",
    "Payment processor",
    "Transaction ID",
    "Payment method",
  ];
  const rows: ExcelCell[][] = items.map((item) => [
    item.order_id,
    item.created_at ?? "",
    item.status ?? "",
    planLabel(item.plan_type),
    item.amount,
    item.currency,
    item.student_user_id ?? "",
    item.student_name ?? "",
    item.student_email ?? "",
    item.affiliate_id ?? "",
    item.affiliate_name ?? "",
    item.affiliate_email ?? "",
    item.affiliate_commission ?? "",
    item.platform_profit ?? "",
    item.payment_processor ?? "",
    item.gateway_transaction_id ?? "",
    item.payment_method_id ?? "",
  ]);
  downloadExcelCsv(reportFilename(from, to), headers, rows);
}

const PAGE_SIZE = 15;

export function AdminReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusOrder = searchParams.get("order")?.trim() || "";
  const initialRange = useMemo(() => defaultDateRange(), []);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<ReportOrderList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(focusOrder || null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<ReportDownloadProgress | null>(null);
  const downloadAbort = useRef<AbortController | null>(null);
  const { finance, currency: financeCurrency, loading: financeLoading } = useAdminFinance();

  const items = report?.items ?? [];
  const currency = report?.totals?.currency ?? "USD";
  const busy = loading && !report;
  const selected = items.find((item) => item.order_id === selectedId) ?? null;
  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void listReportOrders(
      {
        page,
        limit: PAGE_SIZE,
      },
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setReport(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiRequestError ? err.message : "Failed to load orders.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page]);

  useEffect(() => {
    return () => downloadAbort.current?.abort();
  }, []);

  useEffect(() => {
    if (focusOrder) setSelectedId(focusOrder);
  }, [focusOrder]);

  async function handleDownload() {
    if (invalidRange) {
      setError("From date must be on or before the to date.");
      return;
    }
    downloadAbort.current?.abort();
    const controller = new AbortController();
    downloadAbort.current = controller;
    setDownloading(true);
    setError(null);
    setSuccess(null);
    setProgress({ current: 0, total: 0, percent: 0 });
    try {
      await refreshAccessTokenForSession();
      const token = getAccessToken();
      if (!token) throw new Error("Please sign in again to download this report.");
      const rows = await downloadReportOrders({
        dateFrom,
        dateTo,
        token,
        signal: controller.signal,
        onProgress: setProgress,
      });
      downloadReportCsv(dateFrom, dateTo, rows);
      setSuccess(
        rows.length === 1 ? "Downloaded 1 order." : `Downloaded ${rows.length} orders.`,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to download report.");
    } finally {
      setDownloading(false);
      downloadAbort.current = null;
    }
  }

  function cancelDownload() {
    downloadAbort.current?.abort();
    setDownloading(false);
    setProgress(null);
  }

  return (
    <PortalShell
      role="admin"
      title="Report"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={adminNav}
    >
      <div className="dashboard-screen lectures-page orders-page min-w-0 overflow-x-hidden">
        <header className="mb-4 flex min-h-10 min-w-0 items-center gap-2 sm:mb-5 sm:min-h-12 sm:gap-3 md:gap-4">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={openSidebar}
            className="dashboard-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full lg:hidden sm:h-12 sm:w-12"
          >
            <Icon icon={Menu} size={18} />
          </button>
          <h1 className="font-sans min-w-0 truncate text-lg font-bold leading-none tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
            Report
          </h1>
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
          {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

          <FinanceOverviewCard
            caption="Totals"
            title="Overview"
            items={reportsFinanceMetrics(finance, finance.currency || financeCurrency || currency, financeLoading)}
          />

          <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
            <div className="grid min-w-0 grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 sm:flex sm:items-end">
              <ReportDateField
                id="report-date-from"
                label="From"
                value={dateFrom}
                onChange={setDateFrom}
              />
              <ReportDateField
                id="report-date-to"
                label="To"
                value={dateTo}
                onChange={setDateTo}
              />
            </div>
            <button
              type="button"
              disabled={downloading || invalidRange}
              onClick={() => void handleDownload()}
              className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 w-full items-center justify-center rounded-full px-4 text-sm font-medium text-white disabled:pointer-events-none disabled:opacity-50 sm:ml-auto sm:w-auto"
            >
              {downloading ? "Downloading…" : "Download report"}
            </button>
          </div>

          {downloading || progress ? (
            <section className="dashboard-glass-card min-w-0 rounded-2xl px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                    Download
                  </p>
                  <p className="font-sans mt-1 text-sm font-semibold text-[color:var(--dash-text)]">
                    {downloading ? "Exporting orders…" : "Report ready"}
                  </p>
                </div>
                {downloading ? (
                  <button
                    type="button"
                    onClick={cancelDownload}
                    className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--dash-soft)]">
                <div
                  className="h-full rounded-full bg-[#DDE466] transition-[width] duration-200"
                  style={{ width: `${Math.min(100, Math.max(0, progress?.percent ?? 0))}%` }}
                />
              </div>
              <p className="text-brand-caption mt-2 text-[color:var(--dash-faint)]">
                {progress
                  ? `${progress.current} of ${progress.total || "…"} orders · ${progress.percent}%`
                  : "Preparing download…"}
              </p>
            </section>
          ) : null}

          <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-end justify-between gap-2 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                  Orders
                </p>
                <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                  All orders
                </h2>
              </div>
            </div>

            {busy ? (
              <div className="space-y-2 px-4 pb-5 sm:px-5" aria-busy="true" aria-label="Loading orders">
                {Array.from({ length: 4 }, (_, i) => (
                  <span key={i} className="dashboard-skeleton-block block h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center sm:py-14">
                <span className="dashboard-tool-icon flex h-14 w-14 items-center justify-center rounded-full text-[color:var(--dash-text)]">
                  <SidebarSvgIcon name="orders" size={22} strokeWidth={1.85} />
                </span>
                <p className="font-sans mt-4 text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
                  No orders yet
                </p>
                <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
                  Orders will show here as students purchase plans.
                </p>
              </div>
            ) : (
              <>
              <ul className="grid gap-2.5 px-3.5 pb-4 sm:gap-3 sm:px-5 lg:hidden">
                {items.map((item) => (
                  <li key={item.order_id} className="min-w-0">
                    <DirectoryMobileRow
                      title={personLabel(item.student_name, item.student_email, "Student")}
                      subtitle={`${formatDate(item.created_at ?? undefined)} · ${personLabel(item.affiliate_name, item.affiliate_email, "Direct")}`}
                      active={selectedId === item.order_id}
                      ariaLabel={`Open order ${item.order_id}`}
                      onClick={() => setSelectedId(item.order_id)}
                      stats={[
                        { label: "Plan", value: planLabel(item.plan_type) },
                        { label: "Status", value: statusLabel(item.status) },
                        { label: "Amount", value: formatMoney(item.amount, item.currency || currency) },
                        {
                          label: "Commission",
                          value: formatMoney(item.affiliate_commission ?? 0, item.currency || currency),
                        },
                        { label: "Action", value: <span className="portal-action-link">View</span> },
                      ]}
                    />
                  </li>
                ))}
              </ul>
              <div className="hidden min-w-0 overflow-x-auto lg:block">
                <table className="w-full min-w-[54rem] border-separate border-spacing-0 text-left">
                  <thead>
                    <tr className="bg-[color:var(--dash-soft)] text-brand-caption font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]">
                      <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                        Date
                      </th>
                      <th scope="col" className="px-3 py-3 font-semibold">
                        Student
                      </th>
                      <th scope="col" className="px-3 py-3 font-semibold">
                        Plan
                      </th>
                      <th scope="col" className="px-3 py-3 font-semibold">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-3 font-semibold">
                        Affiliate
                      </th>
                      <th scope="col" className="px-3 py-3 font-semibold">
                        Amount
                      </th>
                      <th scope="col" className="px-3 py-3 font-semibold">
                        Commission
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const active = selectedId === item.order_id;
                      return (
                        <tr
                          key={item.order_id}
                          tabIndex={0}
                          role="button"
                          aria-label={`Open order ${item.order_id}`}
                          className={cn(
                            "orders-table-row cursor-pointer outline-none transition focus-visible:bg-[color:var(--dash-soft)]",
                            active ? "bg-[color:var(--dash-soft)]" : "hover:bg-[color:var(--dash-soft)]",
                          )}
                          onClick={() => setSelectedId(item.order_id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedId(item.order_id);
                            }
                          }}
                        >
                          <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                            <span className="font-sans text-sm font-semibold text-[color:var(--dash-text)]">
                              {formatDate(item.created_at ?? undefined)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="font-sans block max-w-[12rem] truncate text-sm font-semibold text-[color:var(--dash-text)]">
                              {personLabel(item.student_name, item.student_email, "Student")}
                            </span>
                            <span className="text-brand-caption block max-w-[12rem] truncate text-[color:var(--dash-faint)]">
                              {item.student_email || "—"}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="font-sans text-sm font-medium text-[color:var(--dash-text)]">
                              {planLabel(item.plan_type)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="text-brand-caption inline-flex rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 font-semibold text-[color:var(--dash-text)]">
                              {statusLabel(item.status)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="font-sans block max-w-[11rem] truncate text-sm font-medium text-[color:var(--dash-text)]">
                              {personLabel(item.affiliate_name, item.affiliate_email, "Direct")}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="font-sans text-sm font-semibold tabular-nums text-[color:var(--dash-amount)]">
                              {formatMoney(item.amount, item.currency || currency)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="font-sans text-sm font-semibold tabular-nums text-[color:var(--dash-amount)]">
                              {formatMoney(item.affiliate_commission ?? 0, item.currency || currency)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                            <span className="portal-action-link">View</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}

            {report && (report.pagination.has_next || report.pagination.has_previous || page > 1) ? (
              <div className="px-4 pb-4 sm:px-5">
                <PaginationControls
                  appearance="lecture"
                  page={report.pagination.page}
                  pageCount={Math.max(1, Math.ceil(report.pagination.total / PAGE_SIZE))}
                  hasNext={report.pagination.has_next}
                  hasPrevious={report.pagination.has_previous}
                  total={report.pagination.total}
                  loading={loading}
                  onPrevious={() => setPage((value) => Math.max(1, value - 1))}
                  onNext={() => setPage((value) => value + 1)}
                />
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {selected ? (
        <DashRightDrawer
          eyebrow="Order"
          title={formatMoney(selected.amount, selected.currency || currency)}
          onClose={() => {
            setSelectedId(null);
            if (focusOrder) router.replace("/admin/reports");
          }}
        >
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <DataField label="Date" value={formatDateTime(selected.created_at)} />
              <DataField
                label="Status"
                value={<StatusBadge tone={statusTone(selected.status)}>{statusLabel(selected.status)}</StatusBadge>}
              />
              <DataField label="Plan" value={planLabel(selected.plan_type)} />
              <DataField label="Order ID" value={selected.order_id} />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <DataField
                label="Student"
                value={
                  selected.student_user_id ? (
                    <UserLink
                      userId={selected.student_user_id}
                      label={personLabel(selected.student_name, selected.student_email, "Student")}
                    />
                  ) : (
                    <span>
                      {personLabel(selected.student_name, selected.student_email, "Student")}
                      {selected.student_email ? (
                        <span className="mt-0.5 block text-[color:var(--dash-faint)]">
                          {selected.student_email}
                        </span>
                      ) : null}
                    </span>
                  )
                }
              />
              <DataField
                label="Affiliate"
                value={
                  selected.affiliate_id
                    ? (
                      <span>
                        {personLabel(selected.affiliate_name, selected.affiliate_email, "Affiliate")}
                        {selected.affiliate_email ? (
                          <span className="mt-0.5 block text-[color:var(--dash-faint)]">
                            {selected.affiliate_email}
                          </span>
                        ) : null}
                      </span>
                    )
                    : "Direct sale"
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DataField
                label="Amount"
                value={formatMoney(selected.amount, selected.currency || currency)}
              />
              <DataField
                label="Commission"
                value={formatMoney(selected.affiliate_commission ?? 0, selected.currency || currency)}
              />
              <DataField
                label="Your earnings"
                value={formatMoney(selected.platform_profit ?? 0, selected.currency || currency)}
              />
              <DataField label="Processor" value={selected.payment_processor || "—"} />
              <DataField label="Transaction" value={selected.gateway_transaction_id || "—"} />
              <DataField label="Payment method" value={selected.payment_method_id || "—"} />
            </div>
          </div>
        </DashRightDrawer>
      ) : null}
    </PortalShell>
  );
}

function ReportDateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="dashboard-field-label px-1">{label}</span>
      <span className="hols-hover-border report-date-field relative inline-flex h-10 w-full min-w-0 items-center border border-[color:var(--dash-surface-border)] px-3.5 sm:w-[13.75rem] sm:shrink-0">
        <input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="hols-plain-control report-date-input h-full min-h-0 min-w-0 flex-1 self-stretch text-[color:var(--dash-text)]"
        />
        <span className="report-date-icon" aria-hidden>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.2" />
            <path d="M3.4 10h17.2M8 3.4v3.6M16 3.4v3.6" />
          </svg>
        </span>
      </span>
    </label>
  );
}
