import { apiRequest } from "@/lib/integrate/client";
import type { AffiliatePayoutItem } from "@/lib/integrate/provider/affiliate/payout";
import type { AdminPaginationMeta } from "@/lib/integrate/provider/admin/users/types";

export type AdminPayoutItem = AffiliatePayoutItem & {
  affiliate_id?: string | null;
  affiliate_name?: string | null;
  affiliate_email?: string | null;
};

export type AdminPayoutOverview = {
  items: AdminPayoutItem[];
  pagination: AdminPaginationMeta;
  pending_count: number;
  pending_amount: number;
  paid_amount: number;
  rejected_count: number;
  currency: string;
};

export type AdminPayoutReviewResult = {
  payout: AdminPayoutItem;
};

export type AdminPayoutReviewAction = "accept" | "reject";

export function listAdminPayouts(
  params: { page?: number; limit?: number } = {},
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return apiRequest<AdminPayoutOverview>(
    `/api/admin/affiliates/payouts${query ? `?${query}` : ""}`,
    { auth: true, signal },
  );
}

export function reviewAdminPayout(
  payoutId: string,
  action: AdminPayoutReviewAction,
  signal?: AbortSignal,
) {
  return apiRequest<AdminPayoutReviewResult>(`/api/admin/affiliates/payouts/${payoutId}/${action}`, {
    method: "POST",
    auth: true,
    body: {},
    signal,
  });
}
