"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, Menu } from "@/components/icons";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { DataField, DirectorySearchBar, PaginationControls, StatusBadge } from "@/components/platform/provider/admin/shared";
import { affiliateNav } from "@/components/platform/provider/affiliate/affiliateNav";
import { AffiliateWalletCards } from "@/components/platform/provider/affiliate/AffiliateWalletCards";
import { RequestPayoutDialog } from "@/components/platform/provider/affiliate/RequestPayoutDialog";
import { SkeletonBlock } from "@/components/platform/provider/student/DashboardSkeletons";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { DashRightDrawer } from "@/components/platform/provider/student/DashRightDrawer";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getAffiliatePayouts,
  requestAffiliatePayout,
  type AffiliatePayoutItem,
  type AffiliatePayoutOverview,
} from "@/lib/integrate/provider/affiliate/payout";
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

const PAGE_SIZE = 10;

const ACTION_LINK_CLASS =
  "font-sans text-sm font-semibold text-[#142644] underline decoration-[rgba(20,38,68,0.45)] decoration-1 underline-offset-[3px] transition-colors hover:text-[#6f7a1c] hover:decoration-[#6f7a1c] focus-visible:text-[#6f7a1c] focus-visible:decoration-[#6f7a1c] focus-visible:outline-none bg-transparent border-0 p-0 cursor-pointer";

type StatusFilter = "all" | "pending" | "paid" | "rejected";
type SortFilter = "newest" | "oldest";

function statusBucket(status?: string): Exclude<StatusFilter, "all"> {
  const value = (status || "pending").toLowerCase();
  if (value === "paid" || value === "completed") return "paid";
  if (value === "rejected" || value === "failed") return "rejected";
  return "pending";
}

export function AffiliatePayoutPage() {
  const [overview, setOverview] = useState<AffiliatePayoutOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortFilter>("newest");

  const wallet = overview?.wallet;
  const currency = wallet?.currency ?? "USD";
  const available = wallet?.available ?? 0;
  const lockDays = overview?.payout_lock_days ?? 7;
  const payouts = overview?.payouts ?? [];
  const filtered = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const next = payouts.filter((item) => {
      if (statusFilter !== "all" && statusBucket(item.status) !== statusFilter) return false;
      if (!needle) return true;
      const id = item.payout_id.toLowerCase();
      const status = statusLabel(item.status).toLowerCase();
      const amount = formatMoney(item.amount, item.currency || currency).toLowerCase();
      return id.includes(needle) || status.includes(needle) || amount.includes(needle);
    });
    next.sort((a, b) => {
      const aTime = Date.parse(a.created_at || "") || 0;
      const bTime = Date.parse(b.created_at || "") || 0;
      return sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
    return next;
  }, [currency, payouts, searchQuery, sort, statusFilter]);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const busy = loading && !overview;
  const selected = payouts.find((item) => item.payout_id === selectedId) ?? null;
  const filtering = Boolean(searchQuery.trim()) || statusFilter !== "all";

  async function loadPayouts(signal?: AbortSignal) {
    const data = await getAffiliatePayouts(signal);
    if (signal?.aborted) return;
    setOverview(data);
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadPayouts(controller.signal)
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiRequestError ? err.message : "Failed to load payouts.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function openDialog() {
    setDialogError(null);
    setSuccess(null);
    setDialogOpen(true);
  }

  async function handlePayout(amount?: number) {
    setSubmitting(true);
    setDialogError(null);
    setError(null);
    setSuccess(null);
    try {
      const result = await requestAffiliatePayout(amount);
      setOverview((current) => ({
        wallet: result.wallet,
        payout_lock_days: current?.payout_lock_days ?? lockDays,
        payout_lock_seconds: current?.payout_lock_seconds,
        student_count: current?.student_count ?? 0,
        payouts: [result.payout, ...(current?.payouts ?? [])],
      }));
      setPage(1);
      setDialogOpen(false);
      setSuccess(
        `Payout requested for ${formatMoney(result.payout.amount, result.payout.currency)}. Waiting for admin review.`,
      );
    } catch (err) {
      setDialogError(err instanceof ApiRequestError ? err.message : "Could not send payout request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell
      role="affiliate"
      title="Payout"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={affiliateNav}
    >
      <div className="dashboard-screen lectures-page orders-page min-w-0 overflow-x-hidden">
        <header className="mb-4 flex min-h-10 min-w-0 items-center gap-2 pt-6 sm:mb-5 sm:min-h-12 sm:gap-3 sm:pt-4 md:gap-4 md:pt-2 lg:pt-0">
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

        <RequestPayoutDialog
          open={dialogOpen}
          available={available}
          currency={currency}
          lockDays={lockDays}
          loading={busy}
          isSubmitting={submitting}
          error={dialogError}
          onClose={() => {
            if (!submitting) setDialogOpen(false);
          }}
          onSubmit={(amount) => void handlePayout(amount)}
        />

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
          {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

          {busy ? (
            <PayoutPageSkeleton />
          ) : (
            <>
          <AffiliateWalletCards
            wallet={wallet}
            currency={currency}
            lockDays={lockDays}
            lockSeconds={overview?.payout_lock_seconds}
            studentCount={overview?.student_count ?? 0}
            order={["pending", "payout", "available", "lock"]}
          />

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <DirectorySearchBar
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                setPage(1);
              }}
              placeholder="Search payouts…"
              label="Search payouts"
              className="mt-0 w-full min-w-0 sm:max-w-[22rem] sm:shrink-0"
            />
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:items-center">
              <ProfileSelect
                id="affiliate-payout-status-filter"
                label="Filter payouts"
                hideLabel
                className="w-full sm:w-[9.75rem]"
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(
                    value === "pending" || value === "paid" || value === "rejected" ? value : "all",
                  );
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All" },
                  { value: "pending", label: "Pending" },
                  { value: "paid", label: "Paid" },
                  { value: "rejected", label: "Rejected" },
                ]}
              />
              <ProfileSelect
                id="affiliate-payout-sort-filter"
                label="Sort payouts"
                hideLabel
                className="w-full sm:w-[9.75rem]"
                value={sort}
                onChange={(value) => {
                  setSort(value === "oldest" ? "oldest" : "newest");
                  setPage(1);
                }}
                options={[
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                ]}
              />
            </div>
            <button
              type="button"
              onClick={openDialog}
              disabled={submitting}
              className="dashboard-navy-btn lecture-page-action font-sans inline-flex h-10 min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium tracking-[0.01em] text-white disabled:pointer-events-none disabled:opacity-60 sm:w-auto"
            >
              <SidebarSvgIcon name="plus" size={15} strokeWidth={2.2} />
              Request payout
            </button>
          </div>

          <section className="dashboard-glass-card mt-3 min-w-0 overflow-hidden rounded-2xl sm:mt-1">
            {payouts.length === 0 && !filtering ? (
              <div className="flex flex-col items-center px-5 py-12 text-center sm:py-14">
                <p className="font-sans text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
                  No payouts yet
                </p>
                <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
                  Request a payout from available balance. An admin will accept or reject it.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="font-sans text-sm font-semibold text-[color:var(--dash-text)]">
                  {searchQuery.trim() ? "No matching payouts" : "No payouts in this filter."}
                </p>
                <p className="text-brand-caption mt-1 text-[color:var(--dash-faint)]">
                  {searchQuery.trim()
                    ? "Try another search or switch the filter."
                    : "Switch the filter, or request a payout."}
                </p>
              </div>
            ) : (
              <>
                <ul className="grid gap-3 px-3.5 py-4 sm:gap-3.5 sm:px-5 md:hidden">
                  {pageItems.map((item) => (
                    <li
                      key={item.payout_id}
                      className="min-w-0 rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4"
                    >
                      <p className="font-sans truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                        #{item.payout_id.slice(0, 10)}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-brand-caption">
                        <div className="min-w-0">
                          <dt className="text-[color:var(--dash-faint)]">Status</dt>
                          <dd className="mt-0.5 break-words font-semibold text-[color:var(--dash-text)]">
                            {statusLabel(item.status)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[color:var(--dash-faint)]">Amount</dt>
                          <dd className="mt-0.5 break-words font-semibold text-[color:var(--dash-amount)]">
                            {formatMoney(item.amount, item.currency || currency)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[color:var(--dash-faint)]">Date</dt>
                          <dd className="mt-0.5 break-words font-medium text-[color:var(--dash-muted)]">
                            {formatDate(item.created_at ?? undefined)}
                          </dd>
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            className={ACTION_LINK_CLASS}
                            onClick={() => setSelectedId(item.payout_id)}
                          >
                            View
                          </button>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
                <div className="hidden min-w-0 overflow-x-hidden md:block">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                    <thead>
                      <tr className="bg-[color:var(--dash-soft)] text-brand-caption font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]">
                        <th scope="col" className="w-[24%] px-4 py-3 font-semibold sm:px-5">
                          Payout ID
                        </th>
                        <th scope="col" className="w-[18%] px-3 py-3 font-semibold">
                          Status
                        </th>
                        <th scope="col" className="w-[20%] px-3 py-3 font-semibold">
                          Amount
                        </th>
                        <th scope="col" className="w-[22%] px-3 py-3 font-semibold">
                          Date
                        </th>
                        <th scope="col" className="w-[16%] px-4 py-3 font-semibold sm:px-5">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((item) => {
                        const active = selectedId === item.payout_id;
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
                            onClick={() => setSelectedId(item.payout_id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedId(item.payout_id);
                              }
                            }}
                          >
                            <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                              <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                #{item.payout_id.slice(0, 10)}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="text-brand-caption inline-flex max-w-full truncate rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 font-semibold text-[color:var(--dash-text)]">
                                {statusLabel(item.status)}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-amount)]">
                                {formatMoney(item.amount, item.currency || currency)}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="text-brand-caption block truncate text-[color:var(--dash-muted)]">
                                {formatDate(item.created_at ?? undefined)}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                              <button
                                type="button"
                                className={ACTION_LINK_CLASS}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedId(item.payout_id);
                                }}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {pageCount > 1 ? (
              <div className="px-3.5 pb-4 sm:px-5">
                <PaginationControls
                  appearance="lecture"
                  page={page}
                  pageCount={pageCount}
                  total={total}
                  hasNext={page < pageCount}
                  hasPrevious={page > 1}
                  loading={loading}
                  onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                  onNext={() => setPage((current) => Math.min(pageCount, current + 1))}
                />
              </div>
            ) : null}
          </section>
            </>
          )}
        </div>
      </div>

      {selected ? (
        <DashRightDrawer
          eyebrow="Payout"
          title={formatMoney(selected.amount, selected.currency || currency)}
          onClose={() => setSelectedId(null)}
        >
          <PayoutDetailPanel payout={selected} currency={currency} />
        </DashRightDrawer>
      ) : null}
    </PortalShell>
  );
}

function PayoutDetailPanel({
  payout,
  currency,
}: {
  payout: AffiliatePayoutItem;
  currency: string;
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans break-words text-xl font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-2xl">
            {formatMoney(payout.amount, payout.currency || currency)}
          </p>
          <p className="text-brand-caption mt-1 break-words text-[color:var(--dash-muted)]">
            {formatDate(payout.created_at ?? undefined)}
          </p>
        </div>
        <StatusBadge tone={statusTone(payout.status)}>{statusLabel(payout.status)}</StatusBadge>
      </div>
      <div className="grid gap-3">
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
    </div>
  );
}

function PayoutPageSkeleton() {
  const columns = ["w-[24%]", "w-[18%]", "w-[20%]", "w-[22%]", "w-[16%]"];

  return (
    <div className="grid min-w-0 gap-3 sm:gap-4" aria-busy="true" aria-label="Loading payouts">
      <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl px-2.5 py-2.5 sm:px-3.5 sm:py-3 md:px-4 md:py-4"
          >
            <SkeletonBlock className="h-3 w-16 max-w-full rounded-full" />
            <SkeletonBlock className="mt-2 h-6 w-20 max-w-full rounded-full" />
          </div>
        ))}
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <SkeletonBlock className="h-10 w-full rounded-full sm:max-w-[22rem] sm:shrink-0" />
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
          <SkeletonBlock className="h-10 w-full rounded-full sm:w-[9.75rem]" />
          <SkeletonBlock className="h-10 w-full rounded-full sm:w-[9.75rem]" />
        </div>
        <SkeletonBlock className="h-10 w-full rounded-full sm:w-40" />
      </div>

      <section className="dashboard-glass-card mt-3 min-w-0 overflow-hidden rounded-2xl sm:mt-1">
        <ul className="grid gap-3 px-3.5 py-4 sm:gap-3.5 sm:px-5 md:hidden">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="min-w-0 overflow-hidden rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4">
              <SkeletonBlock className="h-4 w-28 max-w-full rounded-full" />
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                {Array.from({ length: 4 }, (_, field) => (
                  <div key={field} className="min-w-0 space-y-1.5">
                    <SkeletonBlock className="h-2.5 w-14 max-w-full rounded-full" />
                    <SkeletonBlock className="h-3.5 w-20 max-w-full rounded-full" />
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden min-w-0 overflow-x-hidden md:block">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-[color:var(--dash-soft)]">
                {columns.map((width, index) => (
                  <th key={index} className={cn("px-3 py-3 first:pl-5 last:pr-5", width)}>
                    <SkeletonBlock className="h-3 w-16 max-w-full rounded-full" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }, (_, index) => (
                <tr key={index}>
                  {columns.map((width, cell) => (
                    <td
                      key={cell}
                      className={cn(
                        "border-t border-[color:var(--dash-surface-border)] px-3 py-3 first:pl-5 last:pr-5",
                        width,
                      )}
                    >
                      <SkeletonBlock className="h-4 w-16 max-w-full rounded-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
