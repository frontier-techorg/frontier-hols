"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import {
  DirectorySearchBar,
  PaginationControls,
} from "@/components/platform/provider/admin/shared";
import { OrdersListSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getCachedOrders,
  listOrders,
  type Order,
} from "@/lib/integrate/provider/student/payment/api";
import {
  formatDate,
  formatMoney,
  isWebinarOrder,
  orderItemLabel,
  orderKindLabel,
  orderPlanName,
  planLabels,
  type PlanType,
} from "@/lib/integrate/provider/student/payment/types";
import { scrollAppToTopSoon } from "@/lib/scroll-to-top";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

function invoiceHref(orderId: string) {
  return `/student/orders/${encodeURIComponent(orderId)}/invoice`;
}

type PlanFilter = "all" | PlanType | "webinar";
type SortFilter = "newest" | "oldest";

const PLAN_FILTERS: PlanType[] = ["monthly", "biannual", "annual"];

function isPlanTypeFilter(value: string): value is PlanType {
  return PLAN_FILTERS.includes(value as PlanType);
}

function statusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  if (/paid|complete|success|active/.test(normalized)) return "Paid";
  if (/fail|declined|error/.test(normalized)) return "Failed";
  if (/pending|process/.test(normalized)) return "Pending";
  return status || "—";
}

export function StudentOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [sort, setSort] = useState<SortFilter>("newest");

  const applyPagination = useCallback(
    (
      pageNum: number,
      pagination: {
        total: number;
        has_next: boolean;
        has_previous?: boolean;
      },
    ) => {
      setTotal(pagination.total);
      setHasNext(Boolean(pagination.has_next));
      setHasPrevious(pagination.has_previous ?? pageNum > 1);
    },
    [],
  );

  const loadOrders = useCallback(
    async (pageNum: number, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);

      try {
        const res = await listOrders({ page: pageNum, limit: PAGE_SIZE }, signal);
        if (signal?.aborted) return;
        setOrders(res.items);
        applyPagination(pageNum, res.pagination);
      } catch (err) {
        if (signal?.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiRequestError ? err.message : "Failed to load orders.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [applyPagination],
  );

  useEffect(() => {
    const controller = new AbortController();

    if (page === 1) {
      const cached = getCachedOrders({ page: 1, limit: PAGE_SIZE });
      if (cached) {
        setOrders(cached.items);
        applyPagination(1, cached.pagination);
        setLoading(false);
      }
    }

    const timer = window.setTimeout(() => void loadOrders(page, controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const planFilterOptions = [
    { value: "all", label: "All plans" },
    ...PLAN_FILTERS.map((plan) => ({ value: plan, label: planLabels[plan] })),
    { value: "webinar", label: "Webinar" },
  ];

  const visibleOrders = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    let next = [...orders];

    if (planFilter === "webinar") {
      next = next.filter((order) => isWebinarOrder(order));
    } else if (planFilter !== "all") {
      next = next.filter((order) => !isWebinarOrder(order) && order.plan_type === planFilter);
    }

    if (needle) {
      next = next.filter((order) => {
        const plan = orderItemLabel(order).toLowerCase();
        const status = statusLabel(order.status).toLowerCase();
        const id = order.order_id.toLowerCase();
        return plan.includes(needle) || status.includes(needle) || id.includes(needle);
      });
    }

    next.sort((a, b) => {
      const aTime = Date.parse(a.created_at) || 0;
      const bTime = Date.parse(b.created_at) || 0;
      return sort === "oldest" ? aTime - bTime : bTime - aTime;
    });

    return next;
  }, [orders, planFilter, searchQuery, sort]);

  const filterLabel =
    planFilter === "all" ? "" : planFilter === "webinar" ? "Webinar" : planLabels[planFilter];

  const emptyCopy = searchQuery.trim()
    ? "No matching orders"
    : planFilter !== "all"
      ? `No ${filterLabel} orders on this page.`
      : "No orders yet";

  return (
        <div className="orders-page grid w-full min-w-0 gap-3 sm:gap-4">
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <DirectorySearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search orders…"
              label="Search orders"
              className="mt-0 w-full min-w-0 sm:max-w-[22rem] sm:shrink-0"
            />
            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:items-center">
              <ProfileSelect
                id="orders-plan-filter"
                label="Filter orders"
                hideLabel
                className="w-full sm:w-[9.75rem]"
                value={planFilter}
                onChange={(value) => {
                  if (value === "all" || value === "webinar" || isPlanTypeFilter(value)) {
                    setPlanFilter(value);
                  }
                }}
                options={planFilterOptions}
              />
              <ProfileSelect
                id="orders-sort-filter"
                label="Sort orders"
                hideLabel
                className="w-full sm:w-[9.75rem]"
                value={sort}
                onChange={(value) => setSort(value === "oldest" ? "oldest" : "newest")}
                options={[
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                ]}
              />
            </div>
          </div>

          <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl">
            {loading && orders.length === 0 ? (
              <OrdersListSkeleton />
            ) : total === 0 && !searchQuery.trim() && planFilter === "all" ? (
              <div className="flex flex-col items-center px-5 py-12 text-center sm:py-14">
                <p className="font-sans text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
                  No orders yet
                </p>
                <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
                  Membership purchases will show up here after you buy a plan.
                </p>
              </div>
            ) : visibleOrders.length === 0 && !loading ? (
              <div className="px-4 py-10 text-center">
                <p className="font-sans text-sm font-semibold text-[color:var(--dash-text)]">
                  {emptyCopy}
                </p>
                <p className="text-brand-caption mt-1 text-[color:var(--dash-faint)]">
                  {searchQuery.trim()
                    ? "Try another search or switch the filter."
                    : "Switch the filter, or go to another page."}
                </p>
              </div>
            ) : (
              <>
                <ul className="grid gap-2.5 px-3.5 py-4 sm:gap-3 sm:px-5 md:hidden">
                  {visibleOrders.map((order) => (
                    <li
                      key={order.order_id}
                      className="min-w-0 overflow-hidden rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4"
                    >
                      <p className="font-sans truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                        #{order.order_id.slice(0, 10)}
                      </p>
                      <p className="text-brand-caption mt-1 min-w-0 break-words text-[color:var(--dash-muted)]">
                        {orderPlanName(order)} · {orderKindLabel(order)}
                      </p>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-brand-caption">
                        <div className="min-w-0">
                          <dt className="text-[color:var(--dash-faint)]">Status</dt>
                          <dd className="mt-0.5 break-words font-semibold text-[color:var(--dash-text)]">
                            {statusLabel(order.status)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[color:var(--dash-faint)]">Amount</dt>
                          <dd className="mt-0.5 break-words font-semibold text-[color:var(--dash-amount)]">
                            {formatMoney(order.amount, order.currency)}
                          </dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <dt className="text-[color:var(--dash-faint)]">Date</dt>
                          <dd className="mt-0.5 break-words font-medium text-[color:var(--dash-muted)]">
                            {formatDate(order.created_at)}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-3 flex justify-end border-t border-[color:var(--dash-surface-border)] pt-3">
                        <InvoiceLink orderId={order.order_id} />
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="hidden min-w-0 overflow-x-auto md:block">
                  <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-left">
                    <thead>
                      <tr className="bg-[color:var(--dash-soft)] text-brand-caption font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]">
                        <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                          Order ID
                        </th>
                        <th scope="col" className="px-3 py-3 font-semibold">
                          Plan
                        </th>
                        <th scope="col" className="px-3 py-3 font-semibold">
                          Type
                        </th>
                        <th scope="col" className="px-3 py-3 font-semibold">
                          Status
                        </th>
                        <th scope="col" className="px-3 py-3 font-semibold">
                          Amount
                        </th>
                        <th scope="col" className="px-3 py-3 font-semibold">
                          Date
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOrders.map((order) => (
                        <tr
                          key={order.order_id}
                          className={cn(
                            "orders-table-row outline-none transition",
                            "hover:bg-[color:var(--dash-soft)]",
                          )}
                        >
                          <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                            <span className="font-sans text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                              #{order.order_id.slice(0, 10)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="font-sans min-w-0 truncate text-sm font-semibold text-[color:var(--dash-text)]">
                              {orderPlanName(order)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="text-brand-caption font-medium text-[color:var(--dash-muted)]">
                              {orderKindLabel(order)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="text-brand-caption inline-flex rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 font-semibold text-[color:var(--dash-text)]">
                              {statusLabel(order.status)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="font-sans text-sm font-semibold tabular-nums text-[color:var(--dash-amount)]">
                              {formatMoney(order.amount, order.currency)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                            <span className="text-brand-caption whitespace-nowrap text-[color:var(--dash-muted)]">
                              {formatDate(order.created_at)}
                            </span>
                          </td>
                          <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                            <InvoiceLink orderId={order.order_id} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {total > 0 && (hasNext || hasPrevious || page > 1) ? (
              <div className="px-3.5 pb-4 sm:px-5">
                <PaginationControls
                  appearance="lecture"
                  page={page}
                  total={total}
                  pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                  hasNext={hasNext}
                  hasPrevious={hasPrevious || page > 1}
                  loading={loading}
                  onPrevious={() => {
                    scrollAppToTopSoon();
                    setPage((current) => Math.max(1, current - 1));
                  }}
                  onNext={() => {
                    scrollAppToTopSoon();
                    setPage((current) => current + 1);
                  }}
                />
              </div>
            ) : null}
          </section>
        </div>
  );
}

const ACTION_LINK_CLASS =
  "font-sans text-sm font-semibold text-[#142644] underline decoration-[rgba(20,38,68,0.45)] decoration-1 underline-offset-[3px] transition-colors hover:text-[#6f7a1c] hover:decoration-[#6f7a1c] focus-visible:text-[#6f7a1c] focus-visible:decoration-[#6f7a1c] focus-visible:outline-none";

function InvoiceLink({ orderId }: { orderId: string }) {
  return (
    <Link
      href={invoiceHref(orderId)}
      target="_blank"
      rel="noreferrer"
      className={ACTION_LINK_CLASS}
    >
      Invoice
    </Link>
  );
}

/** @deprecated Use StudentOrdersPage */
export function StudentOrdersPanel() {
  return <StudentOrdersPage />;
}
