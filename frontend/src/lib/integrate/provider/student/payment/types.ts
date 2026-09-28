export type PlanType = "monthly" | "biannual" | "annual";

export type Plan = {
  plan_type: PlanType;
  price: number;
  currency: string;
  duration_days: number;
  updated_by?: string;
  updated_at?: string;
};

export type StudentCommerce = {
  user_id: string;
  total_spent: number;
  admin_earned?: number;
  affiliate_earned?: number;
  order_count: number;
  paid_order_count: number;
  currency: string;
  last_purchase_at?: string | null;
  last_purchase_amount?: number | null;
  last_plan_type?: string | null;
  current_plan?: string | null;
  membership_status?: string | null;
  membership_end_date?: string | null;
};

export type Membership = {
  plan_type: PlanType;
  status: string;
  start_date: string;
  end_date: string;
  order_id: string;
  plan_price: number;
  currency: string;
};

export type Order = {
  order_id: string;
  plan_type?: PlanType | null;
  item_kind?: "plan" | "webinar" | string | null;
  webinar_id?: string | null;
  webinar_title?: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_method_id?: string;
  created_at: string;
  gateway_transaction_id?: string | null;
  payment_processor?: string | null;
  /** Present on admin order history when affiliate attribution is included. */
  affiliate_id?: string | null;
  affiliate_commission?: number | null;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  has_next: boolean;
  has_previous?: boolean;
  next_cursor?: string | null;
};

export function isWebinarOrder(
  order: Pick<Order, "item_kind" | "webinar_id" | "webinar_title">,
) {
  return order.item_kind === "webinar" || Boolean(order.webinar_id || order.webinar_title);
}

export function orderKindLabel(
  order: Pick<Order, "item_kind" | "webinar_id" | "webinar_title">,
) {
  return isWebinarOrder(order) ? "Webinar" : "Subscription";
}

export function orderPlanName(
  order: Pick<Order, "item_kind" | "webinar_id" | "webinar_title" | "plan_type">,
) {
  if (isWebinarOrder(order)) return order.webinar_title || "Webinar";
  if (order.plan_type && planLabels[order.plan_type]) return planLabels[order.plan_type];
  return "Plan";
}

export function orderItemLabel(
  order: Pick<Order, "item_kind" | "webinar_id" | "webinar_title" | "plan_type">,
) {
  if (isWebinarOrder(order)) return order.webinar_title || "Webinar";
  if (order.plan_type && planLabels[order.plan_type]) {
    return `${planLabels[order.plan_type]} plan`;
  }
  return "Order";
}

export const planLabels: Record<PlanType, string> = {
  monthly: "Monthly",
  biannual: "Biannual",
  annual: "Annual",
};

export function formatMoney(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
