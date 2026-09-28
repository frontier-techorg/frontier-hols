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
import { adminNav } from "@/components/platform/provider/admin/adminNav";
import {
  FinanceOverviewCard,
  studentsFinanceMetrics,
} from "@/components/platform/provider/admin/finance/AdminFinanceOverview";
import { useAdminFinance } from "@/components/platform/provider/admin/finance/useAdminFinance";
import { AdminStudentDetailPanel } from "@/components/platform/provider/admin/users/AdminStudentDetailPanel";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { DashRightDrawer } from "@/components/platform/provider/student/DashRightDrawer";
import { ApiRequestError } from "@/lib/integrate/client";
import { getUserProfile } from "@/lib/integrate/provider/admin/profile/api";
import {
  getAffiliate,
  getCachedAffiliate,
  listAdminAffiliateStudents,
  listAllAffiliateStudents,
} from "@/lib/integrate/provider/admin/affiliates";
import {
  getCachedStudents,
  getStudentCommerce,
  listAllStudents,
  listStudentOrders,
  listStudents,
  type StudentSummary,
} from "@/lib/integrate/provider/admin/users/api";
import type { AffiliateSummary } from "@/lib/integrate/provider/admin/users/types";
import {
  formatMoney,
  planLabels,
  type Order,
  type PlanType,
} from "@/lib/integrate/provider/student/payment/types";
import { cn } from "@/lib/utils";

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "S";
}

function studentName(student: StudentSummary) {
  return [student.first_name, student.last_name].filter(Boolean).join(" ") || "Student";
}

function personName(first: string, last: string, fallback: string) {
  return [first, last].filter(Boolean).join(" ") || fallback;
}

function planLabel(plan?: string | null) {
  if (!plan) return "No plan";
  return planLabels[plan as PlanType] ?? plan;
}

function studentMatchesSearch(student: StudentSummary, query: string) {
  const haystack = [
    student.first_name,
    student.last_name,
    student.email,
    student.current_plan,
    student.affiliate?.first_name,
    student.affiliate?.last_name,
    student.affiliate?.email,
    student.affiliate?.invite_code,
    student.referred_by_affiliate_id,
    student.user_id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function summaryFromProfile(
  userId: string,
  profile: Record<string, unknown>,
  commerce?: {
    total_spent?: number;
    admin_earned?: number;
    order_count?: number;
    paid_order_count?: number;
    spend_currency?: string;
    currency?: string;
    current_plan?: string | null;
    membership_status?: string | null;
    last_purchase_at?: string | null;
    last_purchase_amount?: number | null;
  },
): StudentSummary {
  return {
    user_id: String(profile.user_id || userId),
    email: String(profile.email || ""),
    first_name: String(profile.first_name || ""),
    last_name: String(profile.last_name || ""),
    marketing_pref: Boolean(profile.marketing_pref),
    referred_by_affiliate_id: profile.referred_by_affiliate_id
      ? String(profile.referred_by_affiliate_id)
      : undefined,
    total_spent: commerce?.total_spent ?? Number(profile.total_spent || 0),
    admin_earned: commerce?.admin_earned ?? Number(profile.admin_earned || 0),
    order_count: commerce?.order_count ?? Number(profile.order_count || 0),
    paid_order_count: commerce?.paid_order_count ?? Number(profile.paid_order_count || 0),
    spend_currency: commerce?.spend_currency || commerce?.currency || String(profile.spend_currency || "USD"),
    current_plan: (commerce?.current_plan ?? (profile.current_plan as string | null | undefined)) || null,
    membership_status:
      (commerce?.membership_status ?? (profile.membership_status as string | null | undefined)) || null,
    last_purchase_at: commerce?.last_purchase_at ?? (profile.last_purchase_at as string | null | undefined) ?? null,
    last_purchase_amount:
      commerce?.last_purchase_amount ??
      (typeof profile.last_purchase_amount === "number" ? profile.last_purchase_amount : null),
    created_at: profile.created_at ? String(profile.created_at) : undefined,
  };
}

const PAGE_SIZE = 15;
const ORDERS_PAGE_SIZE = 8;

export function AdminStudentsPage({ affiliateId }: { affiliateId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusUser = searchParams.get("user")?.trim() || "";
  const focusOrder = searchParams.get("order")?.trim() || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [affiliate, setAffiliate] = useState<AffiliateSummary | null>(null);
  const [searchPool, setSearchPool] = useState<StudentSummary[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(focusUser || null);
  const [pinnedStudent, setPinnedStudent] = useState<StudentSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersHasNext, setOrdersHasNext] = useState(false);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [emptyOrders, setEmptyOrders] = useState(false);
  const { finance, currency: financeCurrency, loading: financeLoading } = useAdminFinance();

  const trimmedSearch = searchQuery.trim();
  const isSearching = trimmedSearch.length > 0;
  const listParams = {
    sort,
    empty_orders: emptyOrders,
  } as const;
  const affiliateName = affiliate
    ? personName(affiliate.first_name, affiliate.last_name, "Affiliate")
    : "Affiliate";

  const loadStudents = useCallback(async () => {
    if (affiliateId) {
      const cachedAffiliate = getCachedAffiliate(affiliateId);
      if (cachedAffiliate) {
        setAffiliate(cachedAffiliate.affiliate);
      }
      setLoading(true);
      setError(null);
      try {
        const [detail, data] = await Promise.all([
          getAffiliate(affiliateId),
          listAdminAffiliateStudents(affiliateId, { page, limit: PAGE_SIZE, ...listParams }),
        ]);
        setAffiliate(detail.affiliate);
        setStudents(data.items);
        setTotal(data.pagination.total);
        setHasNext(data.pagination.has_next);
        setHasPrevious(data.pagination.has_previous);
      } catch (err) {
        setError(
          err instanceof ApiRequestError ? err.message : "Failed to load this affiliate’s students.",
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    const cachedPage = getCachedStudents({ page, limit: PAGE_SIZE, ...listParams });
    if (cachedPage) {
      setStudents(cachedPage.items);
      setTotal(cachedPage.pagination.total);
      setHasNext(cachedPage.pagination.has_next);
      setHasPrevious(cachedPage.pagination.has_previous);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await listStudents({ page, limit: PAGE_SIZE, ...listParams });
      setStudents(data.items);
      setTotal(data.pagination.total);
      setHasNext(data.pagination.has_next);
      setHasPrevious(data.pagination.has_previous);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load students.");
    } finally {
      setLoading(false);
    }
  }, [affiliateId, emptyOrders, page, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStudents();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStudents]);

  useEffect(() => {
    if (focusUser) setSelectedId(focusUser);
  }, [focusUser]);

  useEffect(() => {
    if (!selectedId) {
      setPinnedStudent(null);
      return;
    }
    const known =
      students.some((student) => student.user_id === selectedId) ||
      Boolean(searchPool?.some((student) => student.user_id === selectedId));
    if (known) {
      setPinnedStudent(null);
      return;
    }
    let cancelled = false;
    void Promise.all([getUserProfile(selectedId), getStudentCommerce(selectedId)])
      .then(([profileData, commerce]) => {
        if (cancelled) return;
        setPinnedStudent(
          summaryFromProfile(selectedId, (profileData.profile || {}) as Record<string, unknown>, commerce),
        );
      })
      .catch(() => {
        if (!cancelled) setPinnedStudent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [searchPool, selectedId, students]);

  useEffect(() => {
    if (!isSearching) {
      setSearchPool(null);
      return;
    }

    let cancelled = false;
    const request = affiliateId
      ? listAllAffiliateStudents(affiliateId, listParams)
      : listAllStudents(listParams);

    void request
      .then((items) => {
        if (!cancelled) setSearchPool(items);
      })
      .catch(() => {
        if (!cancelled) setSearchPool(null);
      });

    return () => {
      cancelled = true;
    };
  }, [affiliateId, emptyOrders, isSearching, sort]);

  const visibleStudents = useMemo(() => {
    const source = isSearching ? searchPool ?? students : students;
    if (!isSearching) return source;
    const query = trimmedSearch.toLowerCase();
    return source.filter((student) => studentMatchesSearch(student, query));
  }, [isSearching, searchPool, students, trimmedSearch]);

  const selected =
    visibleStudents.find((student) => student.user_id === selectedId) ??
    (pinnedStudent?.user_id === selectedId ? pinnedStudent : null);
  const spendCurrency =
    visibleStudents.find((student) => student.spend_currency)?.spend_currency ??
    affiliate?.earnings_currency ??
    "USD";
  const busy = loading && visibleStudents.length === 0;
  const overviewCurrency = finance.currency || financeCurrency || spendCurrency;
  const overviewItems = affiliateId
    ? affiliate
      ? [
          {
            label: "Students",
            value: String(affiliate.student_count ?? total),
            hint: "Referred students",
          },
          {
            label: "Orders",
            value: String(affiliate.order_count ?? 0),
            hint: "Paid referred purchases",
          },
          {
            label: "Student spend",
            value: formatMoney(affiliate.total_order_amount ?? 0, overviewCurrency),
            hint: "Gross collected from referrals",
          },
          {
            label: "Your earnings",
            value: formatMoney(affiliate.admin_earned ?? 0, overviewCurrency),
            hint: "After affiliate commission",
          },
        ]
      : studentsFinanceMetrics(finance, overviewCurrency, true)
    : studentsFinanceMetrics(finance, overviewCurrency, financeLoading);

  useEffect(() => {
    setOrdersPage(1);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setOrders([]);
      setOrdersTotal(0);
      setOrdersHasNext(false);
      setOrdersLoading(false);
      return;
    }
    const controller = new AbortController();
    setOrdersLoading(true);
    void listStudentOrders(selectedId, { page: ordersPage, limit: ORDERS_PAGE_SIZE })
      .then((data) => {
        if (controller.signal.aborted) return;
        setOrders(data.items);
        setOrdersTotal(data.pagination.total);
        setOrdersHasNext(Boolean(data.pagination.has_next));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOrders([]);
          setOrdersTotal(0);
          setOrdersHasNext(false);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setOrdersLoading(false);
      });
    return () => controller.abort();
  }, [ordersPage, selectedId]);

  return (
    <PortalShell
      role="admin"
      title={affiliateId ? `${affiliateName} students` : "Students"}
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
          {affiliateId ? (
            <button
              type="button"
              aria-label="Back to affiliates"
              onClick={() => router.push("/admin/affiliates")}
              className="lecture-back-btn flex h-10 w-8 shrink-0 items-center justify-center rounded-full"
            >
              <SidebarSvgIcon name="back" size={32} className="lecture-back-mark" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="font-sans min-w-0 truncate text-lg font-bold leading-none tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
              Students
            </h1>
            {affiliateId && affiliate ? (
              <p className="text-brand-caption mt-1 truncate text-[color:var(--dash-faint)]">
                {affiliateName}
                {affiliate.email ? ` · ${affiliate.email}` : ""}
              </p>
            ) : null}
          </div>
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

          <FinanceOverviewCard items={overviewItems} />

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <DirectorySearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={
                affiliateId
                  ? "Search by name, email, or plan…"
                  : "Search by name, email, plan, or affiliate…"
              }
              label="Search students"
              className="mt-0 w-full min-w-0 sm:max-w-[22rem] sm:shrink-0"
            />
            <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
              <ProfileSelect
                id="student-orders-filter"
                label="Orders"
                hideLabel
                value={emptyOrders ? "empty" : "all"}
                onChange={(value) => {
                  setEmptyOrders(value === "empty");
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All" },
                  { value: "empty", label: "No orders" },
                ]}
                className="w-full sm:w-[9.75rem]"
              />
              <ProfileSelect
                id="student-sort-filter"
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
            </div>
          </div>

          <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-end justify-between gap-2 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                  Directory
                </p>
                <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                  {affiliateId ? `${affiliateName}’s students` : "All students"}
                </h2>
              </div>
              <p className="text-brand-caption text-[color:var(--dash-faint)]">
                {isSearching
                  ? `${visibleStudents.length} match${visibleStudents.length === 1 ? "" : "es"}`
                  : `${total} total`}
              </p>
            </div>

            {busy ? (
              <StudentsDirectorySkeleton />
            ) : visibleStudents.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center sm:py-14">
                <span className="dashboard-tool-icon flex h-14 w-14 items-center justify-center rounded-full text-[color:var(--dash-text)]">
                  <SidebarSvgIcon name="users" size={22} strokeWidth={1.85} />
                </span>
                <p className="font-sans mt-4 text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
                  {isSearching
                    ? "No students match your search."
                    : emptyOrders
                      ? "No students with zero orders"
                      : "No students yet"}
                </p>
                <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
                  {emptyOrders
                    ? "Students who have not placed an order yet will show here."
                    : affiliateId
                      ? "Students this affiliate refers will show here with spend, orders, and earnings."
                      : "Spend, orders, membership, and earnings will show here as students join and buy plans."}
                </p>
              </div>
            ) : (
              <>
                <ul className="grid gap-2.5 px-3.5 py-4 sm:gap-3 sm:px-5 md:hidden">
                  {visibleStudents.map((student) => {
                    const currency = student.spend_currency || spendCurrency;
                    return (
                      <li key={student.user_id || student.email} className="min-w-0">
                        <DirectoryMobileRow
                          title={studentName(student)}
                          subtitle={student.email}
                          avatar={initials(student.first_name, student.last_name)}
                          active={selectedId === student.user_id}
                          ariaLabel={`Open ${studentName(student)} details`}
                          onClick={() => setSelectedId(student.user_id)}
                          stats={[
                            { label: "Plan", value: planLabel(student.current_plan) },
                            { label: "Orders", value: student.paid_order_count ?? student.order_count ?? 0 },
                            { label: "Spent", value: formatMoney(student.total_spent ?? 0, currency) },
                            {
                              label: "Your earnings",
                              value: formatMoney(student.admin_earned ?? student.total_spent ?? 0, currency),
                            },
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
                        <th scope="col" className="w-[32%] px-4 py-3 font-semibold sm:px-5">
                          Student
                        </th>
                        <th scope="col" className="w-[14%] px-3 py-3 font-semibold">
                          Plan
                        </th>
                        <th scope="col" className="w-[16%] px-3 py-3 font-semibold">
                          Spent
                        </th>
                        <th scope="col" className="w-[18%] px-3 py-3 font-semibold">
                          Your earnings
                        </th>
                        <th scope="col" className="w-[10%] px-3 py-3 font-semibold">
                          Orders
                        </th>
                        <th scope="col" className="w-[10%] px-4 py-3 font-semibold sm:px-5">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStudents.map((student) => {
                        const active = selectedId === student.user_id;
                        const currency = student.spend_currency || spendCurrency;
                        return (
                          <tr
                            key={student.user_id || student.email}
                            tabIndex={0}
                            role="button"
                            aria-label={`Open ${studentName(student)} details`}
                            className={cn(
                              "orders-table-row cursor-pointer outline-none transition focus-visible:bg-[color:var(--dash-soft)]",
                              active ? "bg-[color:var(--dash-soft)]" : "hover:bg-[color:var(--dash-soft)]",
                            )}
                            onClick={() => setSelectedId(student.user_id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedId(student.user_id);
                              }
                            }}
                          >
                            <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--dash-soft)] font-sans text-xs font-bold text-[color:var(--dash-text)]">
                                  {initials(student.first_name, student.last_name)}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-sans truncate text-sm font-semibold text-[color:var(--dash-text)]">
                                    {studentName(student)}
                                  </p>
                                  <p className="text-brand-caption truncate text-[color:var(--dash-faint)]">
                                    {student.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="text-brand-caption inline-flex max-w-full truncate rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 font-semibold text-[color:var(--dash-text)]">
                                {planLabel(student.current_plan)}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                {formatMoney(student.total_spent ?? 0, currency)}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-accent)]">
                                {formatMoney(
                                  student.admin_earned ?? student.total_spent ?? 0,
                                  currency,
                                )}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                {student.paid_order_count ?? student.order_count ?? 0}
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

      {selected ? (
        <DashRightDrawer
          eyebrow="Student"
          title={studentName(selected)}
          onClose={() => {
            setSelectedId(null);
            if (focusUser || focusOrder) {
              router.replace(
                affiliateId
                  ? `/admin/affiliates/${encodeURIComponent(affiliateId)}/students`
                  : "/admin/students",
              );
            }
          }}
        >
          <AdminStudentDetailPanel
            student={selected}
            currency={spendCurrency}
            highlightOrderId={focusOrder || null}
            orders={orders}
            ordersLoading={ordersLoading}
            ordersPage={ordersPage}
            ordersTotal={ordersTotal}
            ordersHasNext={ordersHasNext}
            ordersHasPrevious={ordersPage > 1}
            onOrdersPrevious={() => setOrdersPage((current) => Math.max(1, current - 1))}
            onOrdersNext={() => setOrdersPage((current) => current + 1)}
            showAffiliate={!affiliateId}
          />
        </DashRightDrawer>
      ) : null}
    </PortalShell>
  );
}

function StudentsDirectorySkeleton() {
  const columns = ["w-[32%]", "w-[14%]", "w-[16%]", "w-[18%]", "w-[10%]", "w-[10%]"];

  return (
    <div aria-busy="true" aria-label="Loading students">
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
