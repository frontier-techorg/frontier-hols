"use client";

import { useEffect, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Logo } from "@/components/brand/Logo";
import { displayNameFromUser, useStoredUser } from "@/lib/integrate/auth/useStoredUser";
import { ApiRequestError } from "@/lib/integrate/client";
import { getOrder } from "@/lib/integrate/provider/student/payment/api";
import {
  formatMoney,
  orderKindLabel,
  orderPlanName,
  type Order,
} from "@/lib/integrate/provider/student/payment/types";
import { cn } from "@/lib/utils";

function statusLabel(status: string) {
  if (status === "paid") return "Paid";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  if (status === "refunded") return "Refunded";
  return status;
}

function formatInvoiceDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function shortOrderId(orderId: string) {
  return orderId.slice(0, 10).toUpperCase();
}

export function StudentOrderInvoicePage({ orderId }: { orderId: string }) {
  const { user } = useStoredUser();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getOrder(orderId, controller.signal)
      .then((result) => setOrder(result.order))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiRequestError ? err.message : "Could not load this invoice.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [orderId]);

  useEffect(() => {
    if (!order) return;
    const previous = document.title;
    document.title = `Invoice INV-${shortOrderId(order.order_id)} · HOLS`;
    return () => {
      document.title = previous;
    };
  }, [order]);

  const billedTo = displayNameFromUser(user, "Student");
  const email = typeof user?.profile?.email === "string" ? user.profile.email : "";
  const invoiceNumber = order ? `INV-${shortOrderId(order.order_id)}` : "";
  const planName = order ? orderPlanName(order) : "";
  const amountLabel = order ? formatMoney(order.amount, order.currency) : "";
  const kind = order ? orderKindLabel(order) : "";
  const taxLabel = order ? formatMoney(0, order.currency) : "";

  return (
    <main className="invoice-page min-h-screen bg-[#f0f2f5] px-4 py-8 text-[#132644] sm:px-6 sm:py-12 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="mb-4 flex justify-end print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!order || loading}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-lg bg-[#132644] px-4 font-sans text-sm font-semibold text-white transition hover:bg-[#1a3358]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            Download PDF
          </button>
        </div>

        <article className="invoice-sheet bg-white px-7 py-9 shadow-sm ring-1 ring-[#d8dee8] sm:px-11 sm:py-11 print:shadow-none print:ring-0">
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-[#d8dee8] pb-7">
            <div className="min-w-0">
              <Logo variant="dark" href="" className="h-8 w-auto" />
              <p className="mt-4 font-sans text-sm font-semibold tracking-tight">
                House of Life Sciences LLC
              </p>
            </div>

            <div className="text-left sm:min-w-[13rem] sm:text-right">
              <p className="font-sans text-[1.75rem] font-semibold tracking-tight">Invoice</p>
              {order ? (
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex gap-3 sm:justify-end">
                    <dt className="text-[#5a6a7d]">No.</dt>
                    <dd className="font-semibold tabular-nums">{invoiceNumber}</dd>
                  </div>
                  <div className="flex gap-3 sm:justify-end">
                    <dt className="text-[#5a6a7d]">Date</dt>
                    <dd className="font-semibold">{formatInvoiceDate(order.created_at)}</dd>
                  </div>
                  <div className="flex gap-3 sm:justify-end">
                    <dt className="text-[#5a6a7d]">Status</dt>
                    <dd className="font-semibold">{statusLabel(order.status)}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          </header>

          {error ? (
            <div className="mt-6">
              <AuthAlert>{error}</AuthAlert>
            </div>
          ) : null}

          {loading ? (
            <p className="mt-10 font-sans text-sm text-[#5a6a7d]">Loading invoice…</p>
          ) : null}

          {order ? (
            <div className="mt-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8798]">
                  Bill to
                </p>
                <p className="mt-2 font-sans text-sm font-semibold">{billedTo}</p>
                {email ? <p className="mt-0.5 text-sm text-[#5a6a7d]">{email}</p> : null}
              </div>

              <table className="mt-9 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#132644] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8798]">
                    <th className="pb-3 pr-3 font-semibold">Description</th>
                    <th className="pb-3 pr-3 font-semibold">Type</th>
                    <th className="pb-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-4 pr-3 font-sans text-sm font-semibold">{planName}</td>
                    <td className="py-4 pr-3 text-sm text-[#5a6a7d]">{kind}</td>
                    <td className="py-4 text-right font-sans text-sm font-semibold tabular-nums">
                      {amountLabel}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-2 flex justify-end border-t border-[#d8dee8] pt-4">
                <dl className="w-full max-w-[14rem] space-y-2">
                  <div className="flex items-center justify-between gap-8 text-sm">
                    <dt className="text-[#5a6a7d]">Subtotal</dt>
                    <dd className="font-sans font-medium tabular-nums">{amountLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-8 text-sm">
                    <dt className="text-[#5a6a7d]">Tax</dt>
                    <dd className="font-sans font-medium tabular-nums text-[#5a6a7d]">{taxLabel}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-8 border-t border-[#132644] pt-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8798]">
                      Total
                    </dt>
                    <dd className="font-sans text-xl font-semibold tabular-nums">{amountLabel}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}
        </article>
      </div>
    </main>
  );
}
