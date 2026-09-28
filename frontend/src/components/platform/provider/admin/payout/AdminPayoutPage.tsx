"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, Menu } from "@/components/icons";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import {
  DataField,
  DirectoryMobileRow,
  PaginationControls,
  StatusBadge,
} from "@/components/platform/provider/admin/shared";
import { adminNav } from "@/components/platform/provider/admin/adminNav";
import {
  FinanceOverviewCard,
  payoutFinanceMetrics,
} from "@/components/platform/provider/admin/finance/AdminFinanceOverview";
import { useAdminFinance } from "@/components/platform/provider/admin/finance/useAdminFinance";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { DashRightDrawer } from "@/components/platform/provider/student/DashRightDrawer";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  listAdminPayouts,
  reviewAdminPayout,
  type AdminPayoutItem,
  type AdminPayoutOverview,
  type AdminPayoutReviewAction,
} from "@/lib/integrate/provider/admin/payout";
import { notifyAdminStatsChanged } from "@/lib/integrate/provider/notifications";
import { formatDate, formatMoney } from "@/lib/integrate/provider/student/payment/types";
import { cn } from "@/lib/utils";

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

function statusLabel(status?: string) {
  const value = (status || "pending").trim() || "pending";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusTone(status?: string): "accent" | "warn" | "muted" | "neutral" {
  const value = (status || "pending").toLowerCase();
  if (value === "paid" || value === "completed") return "accent";
  if (value === "rejected" || value === "failed") return "warn";
  if (value === "pending") return "muted";
  return "neutral";
}

function affiliateLabel(item: AdminPayoutItem) {
  return item.affiliate_name?.trim() || item.affiliate_email?.trim() || "Affiliate";
}

const PAGE_SIZE = 15;

export function AdminPayoutPage() {
  const [overview, setOverview] = useState<AdminPayoutOverview | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<AdminPayoutReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminPayoutItem | null>(null);
  const { finance, currency: financeCurrency, loading: financeLoading } = useAdminFinance();

  const currency = overview?.currency ?? "USD";
  const payouts = overview?.items ?? [];
  const total = overview?.pagination.total ?? 0;
  const busy = loading && payouts.length === 0;

  const loadPayouts = useCallback(async (pageNum: number, signal?: AbortSignal) => {
    const data = await listAdminPayouts({ page: pageNum, limit: PAGE_SIZE }, signal);
    if (signal?.aborted) return;
    setOverview(data);
    const lastPage = Math.max(1, data.pagination.total_pages || 1);
    if (data.pagination.total > 0 && pageNum > lastPage) {
      setPage(lastPage);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadPayouts(page, controller.signal)
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiRequestError ? err.message : "Failed to load payouts.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadPayouts, page]);

  async function handleReview(payout: AdminPayoutItem, action: AdminPayoutReviewAction) {
    setReviewing(action);
    setError(null);
    setSuccess(null);
    try {
      const result = await reviewAdminPayout(payout.payout_id, action);
      setSelected((current) =>
        current?.payout_id === result.payout.payout_id ? result.payout : current,
      );
      await loadPayouts(page);
      notifyAdminStatsChanged();
      setSuccess(
        action === "accept"
          ? `Accepted ${formatMoney(result.payout.amount, result.payout.currency || currency)}.`
          : `Rejected ${formatMoney(result.payout.amount, result.payout.currency || currency)}. Funds returned to available.`,
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not review this payout.");
    } finally {
      setReviewing(null);
    }
  }

  return (
    <PortalShell
      role="admin"
      title="Payout"
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
            Payout
          </h1>
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
          {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

          <FinanceOverviewCard
            caption="Totals"
            title="Overview"
            items={payoutFinanceMetrics(finance, finance.currency || financeCurrency || currency, financeLoading)}
          />

          <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-end justify-between gap-2 px-3.5 py-3.5 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                  History
                </p>
                <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                  Payouts
                </h2>
              </div>
              <p className="text-brand-caption text-[color:var(--dash-faint)]">{total} total</p>
            </div>

            {busy ? (
              <div className="space-y-2 px-4 pb-5 sm:px-5" aria-busy="true" aria-label="Loading payouts">
                {Array.from({ length: 3 }, (_, i) => (
                  <span key={i} className="dashboard-skeleton-block block h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : payouts.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center sm:py-14">
                <span className="dashboard-tool-icon flex h-14 w-14 items-center justify-center rounded-full text-[color:var(--dash-text)]">
                  <SidebarSvgIcon name="payment" size={22} strokeWidth={1.85} />
                </span>
                <p className="font-sans mt-4 text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
                  No payout requests yet
                </p>
                <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
                  When an affiliate requests a payout, you can accept or reject it here.
                </p>
              </div>
            ) : (
              <>
              <ul className="grid gap-2.5 px-3.5 pb-4 sm:gap-3 sm:px-5 md:hidden">
                {payouts.map((item) => (
                  <li key={item.payout_id} className="min-w-0">
                    <DirectoryMobileRow
                      title={affiliateLabel(item)}
                      subtitle={formatDate(item.created_at ?? undefined)}
                      active={selected?.payout_id === item.payout_id}
                      ariaLabel={`Open payout ${formatMoney(item.amount, item.currency || currency)}`}
                      onClick={() => setSelected(item)}
                      stats={[
                        { label: "Status", value: statusLabel(item.status) },
                        { label: "Amount", value: formatMoney(item.amount, item.currency || currency) },
                        { label: "Action", value: <span className="portal-action-link">View</span> },
                      ]}
                    />
                  </li>
                ))}
              </ul>
              <div className="hidden min-w-0 overflow-x-auto md:block">
                <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-left">
                  <thead>
                    <tr className="bg-[color:var(--dash-soft)] text-brand-caption font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]">
                      <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                        Date
                      </th>
                      <th scope="col" className="px-3 py-3 font-semibold">
                        Affiliate
                      </th>
                      <th scope="col" className="px-3 py-3 font-semibold">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-3 font-semibold">
                        Amount
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((item) => {
                      const active = selected?.payout_id === item.payout_id;
                      return (
                        <tr
                          key={item.payout_id}
                          tabIndex={0}
                          role="button"
                          aria-label={`Open payout ${formatMoney(item.amount, item.currency || currency)}`}
                          className={cn(
                            "orders-table-row cursor-pointer outline-none transition focus-visible:bg-[color:var(--dash-soft)]",
                            active ? "bg-[color:var(--dash-soft)]" : "hover:bg-[color:var(--dash-soft)]",
                          )}
                          onClick={() => setSelected(item)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelected(item);
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
                              {affiliateLabel(item)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="text-brand-caption inline-flex rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 font-semibold text-[color:var(--dash-text)]">
                              {statusLabel(item.status)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="font-sans text-sm font-semibold tabular-nums text-[color:var(--dash-amount)]">
                              {formatMoney(item.amount, item.currency || currency)}
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

            {(Boolean(overview?.pagination.has_next) || Boolean(overview?.pagination.has_previous) || page > 1) ? (
              <div className="px-4 pb-4 sm:px-5">
                <PaginationControls
                  appearance="lecture"
                  page={overview?.pagination.page ?? page}
                  pageCount={Math.max(1, overview?.pagination.total_pages ?? 1)}
                  total={total}
                  hasNext={Boolean(overview?.pagination.has_next)}
                  hasPrevious={Boolean(overview?.pagination.has_previous)}
                  loading={loading}
                  onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                  onNext={() => setPage((current) => current + 1)}
                />
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {selected ? (
        <DashRightDrawer
          eyebrow="Payout"
          title={formatMoney(selected.amount, selected.currency || currency)}
          onClose={() => setSelected(null)}
        >
          <AdminPayoutDetailPanel
            payout={selected}
            currency={currency}
            reviewing={reviewing}
            onReview={(action) => void handleReview(selected, action)}
          />
        </DashRightDrawer>
      ) : null}
    </PortalShell>
  );
}

function AdminPayoutDetailPanel({
  payout,
  currency,
  reviewing,
  onReview,
}: {
  payout: AdminPayoutItem;
  currency: string;
  reviewing: AdminPayoutReviewAction | null;
  onReview: (action: AdminPayoutReviewAction) => void;
}) {
  const pending = payout.status === "pending";
  const busy = reviewing != null;

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-2xl font-bold tracking-[0.01em] text-[color:var(--dash-text)]">
            {formatMoney(payout.amount, payout.currency || currency)}
          </p>
          <p className="text-brand-caption mt-1 text-[color:var(--dash-muted)]">
            {formatDate(payout.created_at ?? undefined)}
          </p>
        </div>
        <StatusBadge tone={statusTone(payout.status)}>{statusLabel(payout.status)}</StatusBadge>
      </div>
      <div className="grid gap-3">
        <DataField label="Affiliate" value={affiliateLabel(payout)} />
        {payout.affiliate_email ? <DataField label="Email" value={payout.affiliate_email} /> : null}
        <DataField label="Status" value={statusLabel(payout.status)} />
        <DataField label="Date" value={formatDate(payout.created_at ?? undefined)} />
        {payout.reviewed_at ? (
          <DataField label="Reviewed" value={formatDate(payout.reviewed_at)} />
        ) : null}
        <DataField
          label="Reference"
          value={<span className="font-mono text-xs break-all">{payout.payout_id}</span>}
        />
      </div>
      {pending ? (
        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--dash-surface-border)] pt-4 sm:flex-row sm:justify-end sm:gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview("reject")}
            className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium text-[color:var(--dash-text)] disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          >
            {reviewing === "reject" ? (
              <>
                <SidebarSvgIcon name="spinner" size={16} strokeWidth={2.5} className="mr-1.5 animate-spin" />
                Rejecting…
              </>
            ) : (
              "Reject"
            )}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview("accept")}
            className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium text-white disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          >
            {reviewing === "accept" ? (
              <>
                <SidebarSvgIcon name="spinner" size={16} strokeWidth={2.5} className="animate-spin" />
                Accepting…
              </>
            ) : (
              "Accept"
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
