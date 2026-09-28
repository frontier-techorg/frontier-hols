"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Icon, Menu } from "@/components/icons";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import {
  DirectoryMobileRow,
  DirectorySearchBar,
  PaginationControls,
} from "@/components/platform/provider/admin/shared";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { Button } from "@/components/ui/Button";
import {
  CreateAffiliateDialog,
  type CreateAffiliateFormValues,
} from "@/components/platform/provider/admin/users/CreateAffiliateDialog";
import { adminNav } from "@/components/platform/provider/admin/adminNav";
import {
  FinanceOverviewCard,
  affiliatesFinanceMetrics,
} from "@/components/platform/provider/admin/finance/AdminFinanceOverview";
import { useAdminFinance } from "@/components/platform/provider/admin/finance/useAdminFinance";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  createAffiliate,
  getCachedAdminAffiliates,
  listAdminAffiliates,
  listAllAdminAffiliates,
} from "@/lib/integrate/provider/admin/affiliates";
import type { AffiliateSummary } from "@/lib/integrate/provider/admin/users/types";
import { formatMoney } from "@/lib/integrate/provider/student/payment/types";
import { notifyAdminStatsChanged } from "@/lib/integrate/provider/notifications";
import { cn } from "@/lib/utils";

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "A";
}

function personName(first: string, last: string, fallback: string) {
  return [first, last].filter(Boolean).join(" ") || fallback;
}

const PAGE_SIZE = 15;

function affiliateMatchesSearch(affiliate: AffiliateSummary, query: string) {
  const haystack = [
    affiliate.first_name,
    affiliate.last_name,
    affiliate.email,
    affiliate.invite_code,
    affiliate.user_id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function AdminAffiliatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusUser = searchParams.get("user")?.trim() || "";
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [affiliates, setAffiliates] = useState<AffiliateSummary[]>([]);
  const [searchPool, setSearchPool] = useState<AffiliateSummary[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [emptyReferrals, setEmptyReferrals] = useState(false);
  const { finance, currency: financeCurrency, loading: financeLoading } = useAdminFinance();

  const trimmedSearch = searchQuery.trim();
  const isSearching = trimmedSearch.length > 0;
  const listParams = {
    sort,
    empty_referrals: emptyReferrals,
  } as const;

  const loadAffiliates = useCallback(async () => {
    const cachedPage = getCachedAdminAffiliates({ page, limit: PAGE_SIZE, ...listParams });
    if (cachedPage) {
      setAffiliates(cachedPage.items);
      setTotal(cachedPage.pagination.total);
      setHasNext(cachedPage.pagination.has_next);
      setHasPrevious(cachedPage.pagination.has_previous);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await listAdminAffiliates({ page, limit: PAGE_SIZE, ...listParams });
      setAffiliates(data.items);
      setTotal(data.pagination.total);
      setHasNext(data.pagination.has_next);
      setHasPrevious(data.pagination.has_previous);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load affiliates.");
    } finally {
      setLoading(false);
    }
  }, [emptyReferrals, page, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAffiliates();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAffiliates]);

  useEffect(() => {
    if (!isSearching) {
      setSearchPool(null);
      return;
    }

    let cancelled = false;
    void listAllAdminAffiliates(listParams)
      .then((items) => {
        if (!cancelled) setSearchPool(items);
      })
      .catch(() => {
        if (!cancelled) setSearchPool(null);
      });

    return () => {
      cancelled = true;
    };
  }, [emptyReferrals, isSearching, sort]);

  const visibleAffiliates = useMemo(() => {
    const source = isSearching ? searchPool ?? affiliates : affiliates;
    if (!isSearching) return source;
    const query = trimmedSearch.toLowerCase();
    return source.filter((affiliate) => affiliateMatchesSearch(affiliate, query));
  }, [affiliates, isSearching, searchPool, trimmedSearch]);

  const earningsCurrency =
    visibleAffiliates.find((affiliate) => affiliate.earnings_currency)?.earnings_currency ?? "USD";
  const busy = loading && visibleAffiliates.length === 0;

  function openAffiliateStudents(affiliateId: string) {
    router.push(`/admin/affiliates/${encodeURIComponent(affiliateId)}/students`);
  }

  useEffect(() => {
    if (!focusUser) return;
    router.push(`/admin/affiliates/${encodeURIComponent(focusUser)}/students`);
  }, [focusUser, router]);

  function openCreateDialog() {
    setDialogError(null);
    setError(null);
    setCreateOpen(true);
  }

  async function handleCreateAffiliate(values: CreateAffiliateFormValues) {
    setCreating(true);
    setDialogError(null);
    setSuccess(null);

    try {
      const data = await createAffiliate({
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        password: values.password || undefined,
        margin_percent: Number(values.margin_percent),
        invitation_quota: values.invitation_quota ? Number(values.invitation_quota) : undefined,
      });

      setCreateOpen(false);
      setSuccess(
        data.credential_email_queued
          ? "Affiliate created and credential email queued."
          : "Affiliate created.",
      );
      notifyAdminStatsChanged();

      if (page === 1) {
        await loadAffiliates();
      } else {
        setPage(1);
      }
    } catch (err) {
      setDialogError(err instanceof ApiRequestError ? err.message : "Could not create affiliate.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <PortalShell
      role="admin"
      title="Affiliates"
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
          <h1 className="font-sans min-w-0 flex-1 truncate text-lg font-bold leading-none tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
            Affiliates
          </h1>
          <button
            type="button"
            aria-label="Add affiliate"
            onClick={openCreateDialog}
            className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white sm:hidden"
          >
            <SidebarSvgIcon name="plus" size={15} strokeWidth={2.2} />
          </button>
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
          {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

          <FinanceOverviewCard
            items={affiliatesFinanceMetrics(
              finance,
              finance.currency || financeCurrency || earningsCurrency,
              financeLoading,
            )}
          />

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <DirectorySearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by name, email, or invite code…"
              label="Search affiliates"
              className="mt-0 w-full min-w-0 sm:max-w-[22rem] sm:shrink-0"
            />
            <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:items-center">
              <ProfileSelect
                id="affiliate-referrals-filter"
                label="Referrals"
                hideLabel
                value={emptyReferrals ? "empty" : "all"}
                onChange={(value) => {
                  setEmptyReferrals(value === "empty");
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All" },
                  { value: "empty", label: "No referrals" },
                ]}
                className="w-full sm:w-[9.75rem]"
              />
              <ProfileSelect
                id="affiliate-sort-filter"
                label="Sort"
                hideLabel
                value={sort}
                onChange={(value) => {
                  setSort(value === "oldest" ? "oldest" : "newest");
                  setPage(1);
                }}
                options={[
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                ]}
                className="w-full sm:w-[9.75rem]"
              />
              <button
                type="button"
                onClick={openCreateDialog}
                className="lecture-page-action dashboard-navy-btn font-sans col-span-2 hidden h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium text-white sm:inline-flex"
              >
                <SidebarSvgIcon name="plus" size={15} strokeWidth={2.2} />
                Add affiliate
              </button>
            </div>
          </div>

          <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-end justify-between gap-2 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                  Directory
                </p>
                <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                  All affiliates
                </h2>
              </div>
              <p className="text-brand-caption text-[color:var(--dash-faint)]">
                {isSearching
                  ? `${visibleAffiliates.length} match${visibleAffiliates.length === 1 ? "" : "es"}`
                  : `${total} total`}
              </p>
            </div>

            {busy ? (
              <AffiliatesDirectorySkeleton />
            ) : visibleAffiliates.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center sm:py-14">
                <span className="dashboard-tool-icon flex h-14 w-14 items-center justify-center rounded-full text-[color:var(--dash-text)]">
                  <SidebarSvgIcon name="referrals" size={22} strokeWidth={1.85} />
                </span>
                <p className="font-sans mt-4 text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
                  {isSearching
                    ? "No affiliates match your search."
                    : emptyReferrals
                      ? "No affiliates with zero referrals"
                      : "No affiliates yet"}
                </p>
                <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
                  {emptyReferrals
                    ? "Affiliates who have not referred a student yet will show here."
                    : "Add an affiliate, then open a row to see their students."}
                </p>
                {!isSearching && !emptyReferrals ? (
                  <Button type="button" onClick={openCreateDialog} className="lecture-page-action mt-4 px-5">
                    Create first affiliate
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <ul className="grid gap-2.5 px-3.5 py-4 sm:gap-3 sm:px-5 md:hidden">
                  {visibleAffiliates.map((affiliate) => {
                    const currency = affiliate.earnings_currency || earningsCurrency;
                    const name = personName(affiliate.first_name, affiliate.last_name, "Affiliate");
                    return (
                      <li key={affiliate.user_id || affiliate.email} className="min-w-0">
                        <DirectoryMobileRow
                          title={name}
                          subtitle={affiliate.email}
                          avatar={initials(affiliate.first_name, affiliate.last_name)}
                          ariaLabel={`Open students for ${name}`}
                          onClick={() => openAffiliateStudents(affiliate.user_id)}
                          stats={[
                            { label: "Students", value: affiliate.student_count },
                            { label: "Earned", value: formatMoney(affiliate.total_earned ?? 0, currency) },
                            { label: "Paid out", value: formatMoney(affiliate.paid_out ?? 0, currency) },
                            { label: "Your earnings", value: formatMoney(affiliate.admin_earned ?? 0, currency) },
                            { label: "Action", value: <span className="portal-action-link">View</span> },
                          ]}
                        />
                      </li>
                    );
                  })}
                </ul>
                <div className="hidden min-w-0 overflow-x-hidden md:block">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                    <thead>
                      <tr className="bg-[color:var(--dash-soft)] text-brand-caption font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]">
                        <th scope="col" className="w-[30%] px-4 py-3 font-semibold sm:px-5">
                          Affiliate
                        </th>
                        <th scope="col" className="w-[12%] px-3 py-3 font-semibold">
                          Students
                        </th>
                        <th scope="col" className="w-[16%] px-3 py-3 font-semibold">
                          Earned
                        </th>
                        <th scope="col" className="w-[18%] px-3 py-3 font-semibold">
                          Paid out
                        </th>
                        <th scope="col" className="w-[14%] px-3 py-3 font-semibold">
                          Your earnings
                        </th>
                        <th scope="col" className="w-[10%] px-4 py-3 font-semibold sm:px-5">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAffiliates.map((affiliate) => {
                        const currency = affiliate.earnings_currency || earningsCurrency;
                        const name = personName(
                          affiliate.first_name,
                          affiliate.last_name,
                          "Affiliate",
                        );
                        const pending = affiliate.pending ?? 0;
                        return (
                          <tr
                            key={affiliate.user_id || affiliate.email}
                            tabIndex={0}
                            role="button"
                            aria-label={`Open students for ${name}`}
                            className="orders-table-row cursor-pointer outline-none transition hover:bg-[color:var(--dash-soft)] focus-visible:bg-[color:var(--dash-soft)]"
                            onClick={() => openAffiliateStudents(affiliate.user_id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openAffiliateStudents(affiliate.user_id);
                              }
                            }}
                          >
                            <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--dash-soft)] font-sans text-xs font-bold text-[color:var(--dash-text)]">
                                  {initials(affiliate.first_name, affiliate.last_name)}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-sans truncate text-sm font-semibold text-[color:var(--dash-text)]">
                                    {name}
                                  </p>
                                  <p className="text-brand-caption truncate text-[color:var(--dash-faint)]">
                                    {affiliate.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                {affiliate.student_count}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                {formatMoney(affiliate.total_earned ?? 0, currency)}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <div className="min-w-0">
                                <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                  {formatMoney(affiliate.paid_out ?? 0, currency)}
                                </span>
                                {pending > 0 ? (
                                  <p className="text-brand-caption mt-0.5 truncate tabular-nums text-[color:var(--dash-faint)]">
                                    Pending {formatMoney(pending, currency)}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-accent)]">
                                {formatMoney(affiliate.admin_earned ?? 0, currency)}
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

                {!isSearching && (hasNext || hasPrevious || page > 1) ? (
                  <div className="px-4 pb-4 sm:px-5">
                    <PaginationControls
                      appearance="lecture"
                      page={page}
                      total={total}
                      pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                      hasNext={hasNext}
                      hasPrevious={hasPrevious}
                      loading={loading}
                      onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                      onNext={() => setPage((current) => current + 1)}
                    />
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>

      <CreateAffiliateDialog
        open={createOpen}
        isSubmitting={creating}
        error={dialogError}
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        onSubmit={(values) => void handleCreateAffiliate(values)}
      />
    </PortalShell>
  );
}

function AffiliatesDirectorySkeleton() {
  const columns = ["w-[30%]", "w-[12%]", "w-[16%]", "w-[18%]", "w-[14%]", "w-[10%]"];

  return (
    <div aria-busy="true" aria-label="Loading affiliates">
      <ul className="grid gap-2.5 px-3.5 py-4 sm:gap-3 sm:px-5 md:hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="min-w-0 overflow-hidden rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="dashboard-skeleton-block h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="dashboard-skeleton-block block h-3.5 w-[62%] max-w-full rounded-full" />
                <span className="dashboard-skeleton-block block h-3 w-[78%] max-w-full rounded-full" />
              </div>
              <span className="dashboard-skeleton-block h-4 w-4 shrink-0 rounded-full" />
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
              {Array.from({ length: 5 }, (_, field) => (
                <div key={field} className="min-w-0 space-y-1.5">
                  <span className="dashboard-skeleton-block block h-2.5 w-14 max-w-full rounded-full" />
                  <span className="dashboard-skeleton-block block h-3.5 w-20 max-w-full rounded-full" />
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
                  <span className="dashboard-skeleton-block block h-3 w-16 max-w-full rounded-full" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, index) => (
              <tr key={index}>
                <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="dashboard-skeleton-block h-9 w-9 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <span className="dashboard-skeleton-block block h-3.5 w-[70%] max-w-full rounded-full" />
                      <span className="dashboard-skeleton-block block h-3 w-[86%] max-w-full rounded-full" />
                    </div>
                  </div>
                </td>
                {columns.slice(1).map((width, cell) => (
                  <td key={cell} className={cn("border-t border-[color:var(--dash-surface-border)] px-3 py-3 last:pr-5", width)}>
                    <span className="dashboard-skeleton-block block h-4 w-14 max-w-full rounded-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
