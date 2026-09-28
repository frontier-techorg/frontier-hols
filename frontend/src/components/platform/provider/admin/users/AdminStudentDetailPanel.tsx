"use client";

import { DataField, PaginationControls, StatusBadge } from "@/components/platform/provider/admin/shared";
import type { StudentSummary } from "@/lib/integrate/provider/admin/users/types";
import {
  formatDate,
  formatMoney,
  orderKindLabel,
  orderPlanName,
  planLabels,
  type Order,
  type PlanType,
} from "@/lib/integrate/provider/student/payment/types";
import { cn } from "@/lib/utils";

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "S";
}

function personName(first: string, last: string, fallback: string) {
  return [first, last].filter(Boolean).join(" ") || fallback;
}

function planLabel(plan?: string | null) {
  if (!plan) return "No plan";
  return planLabels[plan as PlanType] ?? plan;
}

function membershipLabel(status?: string | null) {
  if (!status) return "None";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusLabel(status: string) {
  if (status === "paid") return "Paid";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  if (status === "refunded") return "Refunded";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function affiliateName(student: StudentSummary) {
  if (student.affiliate) {
    return personName(student.affiliate.first_name, student.affiliate.last_name, "Affiliate");
  }
  return null;
}

export function AdminStudentDetailPanel({
  student,
  currency,
  orders = [],
  ordersLoading = false,
  ordersPage = 1,
  ordersTotal = 0,
  ordersHasNext = false,
  ordersHasPrevious = false,
  ordersPageSize = 8,
  onOrdersPrevious,
  onOrdersNext,
  showAffiliate = true,
  highlightOrderId = null,
}: {
  student: StudentSummary;
  currency: string;
  orders?: Order[];
  ordersLoading?: boolean;
  ordersPage?: number;
  ordersTotal?: number;
  ordersHasNext?: boolean;
  ordersHasPrevious?: boolean;
  ordersPageSize?: number;
  onOrdersPrevious?: () => void;
  onOrdersNext?: () => void;
  showAffiliate?: boolean;
  highlightOrderId?: string | null;
}) {
  const spendCurrency = student.spend_currency || currency;
  const referredName = affiliateName(student);
  const orderCount = student.paid_order_count ?? student.order_count ?? 0;

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--dash-soft)] font-sans text-sm font-bold text-[color:var(--dash-text)]">
          {initials(student.first_name, student.last_name)}
        </span>
        <div className="min-w-0">
          <p className="font-sans break-words text-base font-semibold text-[color:var(--dash-text)]">
            {personName(student.first_name, student.last_name, "Student")}
          </p>
          <p className="text-brand-body mt-0.5 break-all text-sm text-[color:var(--dash-muted)]">
            {student.email}
          </p>
          <div className="mt-2">
            <StatusBadge tone={student.current_plan ? "accent" : "muted"}>
              {planLabel(student.current_plan)}
            </StatusBadge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2">
        <DataField label="Spent" value={formatMoney(student.total_spent ?? 0, spendCurrency)} />
        <DataField
          label="Your earnings"
          value={
            <span className="text-[color:var(--dash-accent)]">
              {formatMoney(student.admin_earned ?? student.total_spent ?? 0, spendCurrency)}
            </span>
          }
        />
        <DataField
          label="Affiliate earnings"
          value={formatMoney(student.affiliate_earned ?? 0, spendCurrency)}
        />
        <DataField label="Orders" value={String(orderCount)} />
        <DataField label="Plan" value={planLabel(student.current_plan)} />
        <DataField label="Membership" value={membershipLabel(student.membership_status)} />
        {showAffiliate ? (
          <DataField
            label="Affiliate"
            className="min-[22rem]:col-span-2"
            value={
              referredName ??
              (student.referred_by_affiliate_id ? student.referred_by_affiliate_id : "Direct signup")
            }
          />
        ) : null}
        <DataField
          label="Last purchase"
          className="min-[22rem]:col-span-2"
          value={
            student.last_purchase_at
              ? `${formatDate(student.last_purchase_at)}${
                  student.last_purchase_amount != null
                    ? ` · ${formatMoney(student.last_purchase_amount, spendCurrency)}`
                    : ""
                }`
              : "—"
            }
        />
        <DataField
          label="Joined"
          value={student.created_at ? formatDate(student.created_at) : "—"}
        />
        <DataField label="Marketing" value={student.marketing_pref ? "On" : "Off"} />
      </div>

      <div className="grid min-w-0 gap-2">
        <div className="flex items-end justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
            Orders
          </p>
          {ordersTotal > 0 ? (
            <p className="text-brand-caption text-[color:var(--dash-faint)]">{ordersTotal} total</p>
          ) : null}
        </div>
        {ordersLoading ? (
          <div className="grid min-w-0 gap-2.5" aria-busy="true" aria-label="Loading orders">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="min-w-0 rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4">
                <span className="dashboard-skeleton-block block h-4 w-28 max-w-full rounded-full" />
                <span className="dashboard-skeleton-block mt-2 block h-3 w-40 max-w-full rounded-full" />
                <div className="mt-3 grid grid-cols-1 gap-2 min-[22rem]:grid-cols-2">
                  {Array.from({ length: 3 }, (_, field) => (
                    <div key={field} className={cn("min-w-0 space-y-1.5", field === 2 && "min-[22rem]:col-span-2")}>
                      <span className="dashboard-skeleton-block block h-2.5 w-14 max-w-full rounded-full" />
                      <span className="dashboard-skeleton-block block h-3.5 w-20 max-w-full rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="text-brand-body text-sm text-[color:var(--dash-muted)]">No orders yet.</p>
        ) : (
          <ul className="grid min-w-0 gap-2.5">
            {orders.map((order) => (
              <li
                key={order.order_id}
                className={cn(
                  "min-w-0 rounded-2xl px-4 py-4",
                  highlightOrderId && highlightOrderId === order.order_id
                    ? "bg-[color:var(--dash-accent-soft,var(--dash-soft))] ring-2 ring-[color:var(--dash-accent)]"
                    : "bg-[color:var(--dash-soft)]/80",
                )}
              >
                <p className="font-sans truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                  #{order.order_id.slice(0, 10)}
                </p>
                <p className="text-brand-caption mt-1 text-[color:var(--dash-muted)]">
                  {orderPlanName(order)} · {orderKindLabel(order)}
                </p>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-brand-caption min-[22rem]:grid-cols-2">
                  <div>
                    <dt className="text-[color:var(--dash-faint)]">Status</dt>
                    <dd className="mt-0.5 font-semibold text-[color:var(--dash-text)]">
                      {statusLabel(order.status)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[color:var(--dash-faint)]">Amount</dt>
                    <dd className="mt-0.5 font-semibold text-[color:var(--dash-amount)]">
                      {formatMoney(order.amount, order.currency || spendCurrency)}
                    </dd>
                  </div>
                  <div className="min-[22rem]:col-span-2">
                    <dt className="text-[color:var(--dash-faint)]">Date</dt>
                    <dd className="mt-0.5 font-medium text-[color:var(--dash-muted)]">
                      {formatDate(order.created_at)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
        {onOrdersPrevious && onOrdersNext && (ordersHasNext || ordersHasPrevious) ? (
          <PaginationControls
            appearance="lecture"
            page={ordersPage}
            total={ordersTotal}
            pageCount={Math.max(1, Math.ceil(ordersTotal / ordersPageSize))}
            hasNext={ordersHasNext}
            hasPrevious={ordersHasPrevious}
            loading={ordersLoading}
            onPrevious={onOrdersPrevious}
            onNext={onOrdersNext}
          />
        ) : null}
      </div>
    </div>
  );
}
