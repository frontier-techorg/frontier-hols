import { listAdminAffiliates } from "@/lib/integrate/provider/admin/affiliates/api";
import {
  getAffiliateEarnings,
  listStudentOrders,
  listStudents,
} from "@/lib/integrate/provider/admin/users/api";
import type {
  AffiliateCommissionItem,
  AffiliateSummary,
  StudentSummary,
} from "@/lib/integrate/provider/admin/users/types";
import {
  downloadExcelCsv,
  exportStamp,
  type ExcelCell,
} from "@/lib/export/excelCsv";
import {
  orderItemLabel,
  planLabels,
  type Order,
  type PlanType,
} from "@/lib/integrate/provider/student/payment/types";

const PAGE_LIMIT = 100;

async function fetchAllStudents(): Promise<StudentSummary[]> {
  const items: StudentSummary[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await listStudents({ page, limit: PAGE_LIMIT });
    items.push(...data.items);
    hasNext = Boolean(data.pagination.has_next);
    page += 1;
    if (page > 200) break;
  }

  return items;
}

async function fetchAllAffiliates(): Promise<AffiliateSummary[]> {
  const items: AffiliateSummary[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await listAdminAffiliates({ page, limit: PAGE_LIMIT });
    items.push(...data.items);
    hasNext = Boolean(data.pagination.has_next);
    page += 1;
    if (page > 200) break;
  }

  return items;
}

async function fetchAllStudentOrders(userId: string): Promise<Order[]> {
  const items: Order[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await listStudentOrders(userId, { page, limit: PAGE_LIMIT });
    items.push(...data.items);
    hasNext = Boolean(data.pagination.has_next);
    page += 1;
    if (page > 200) break;
  }

  return items;
}

function planLabel(plan?: string | null) {
  if (!plan) return "";
  return planLabels[plan as PlanType] ?? plan;
}

export async function exportStudentsPaymentExcel(options?: {
  students?: StudentSummary[];
}) {
  const students = options?.students ?? (await fetchAllStudents());
  const headers = [
    "Student ID",
    "First name",
    "Last name",
    "Email",
    "Total spent",
    "Currency",
    "Orders",
    "Paid orders",
    "Current plan",
    "Membership status",
    "Last purchase at",
    "Last purchase amount",
    "Affiliate ID",
    "Affiliate name",
    "Affiliate email",
    "Marketing pref",
    "Created at",
  ];

  const rows: ExcelCell[][] = students.map((student) => [
    student.user_id,
    student.first_name,
    student.last_name,
    student.email,
    student.total_spent ?? 0,
    student.spend_currency ?? "USD",
    student.order_count ?? 0,
    student.paid_order_count ?? 0,
    planLabel(student.current_plan),
    student.membership_status ?? "",
    student.last_purchase_at ?? "",
    student.last_purchase_amount ?? "",
    student.referred_by_affiliate_id ?? student.affiliate?.user_id ?? "",
    student.affiliate
      ? `${student.affiliate.first_name} ${student.affiliate.last_name}`.trim()
      : "",
    student.affiliate?.email ?? "",
    student.marketing_pref,
    student.created_at ?? "",
  ]);

  downloadExcelCsv(exportStamp("hols-student-payments"), headers, rows);
  return students.length;
}

export async function exportAffiliatesPaymentExcel(options?: {
  affiliates?: AffiliateSummary[];
}) {
  const affiliates = options?.affiliates ?? (await fetchAllAffiliates());
  const headers = [
    "Affiliate ID",
    "First name",
    "Last name",
    "Email",
    "Invite code",
    "Margin %",
    "Students",
    "Invitation quota",
    "Total earned",
    "Lock amount",
    "Available",
    "Paid out",
    "Currency",
    "Commissionable orders",
    "Created at",
  ];

  const rows: ExcelCell[][] = affiliates.map((affiliate) => [
    affiliate.user_id,
    affiliate.first_name,
    affiliate.last_name,
    affiliate.email,
    affiliate.invite_code ?? "",
    affiliate.margin_percent ?? "",
    affiliate.student_count,
    affiliate.invitation_quota ?? "Unlimited",
    affiliate.total_earned ?? 0,
    affiliate.lock_amount ?? 0,
    affiliate.available ?? 0,
    affiliate.paid_out ?? 0,
    affiliate.earnings_currency ?? "USD",
    affiliate.order_count ?? 0,
    affiliate.created_at ?? "",
  ]);

  downloadExcelCsv(exportStamp("hols-affiliate-earnings"), headers, rows);
  return affiliates.length;
}

export async function exportStudentOrdersExcel(userId: string, studentLabel?: string) {
  const orders = await fetchAllStudentOrders(userId);
  const headers = [
    "Order ID",
    "Student ID",
    "Plan",
    "Amount",
    "Currency",
    "Status",
    "Affiliate ID",
    "Affiliate commission",
    "Created at",
  ];

  const rows: ExcelCell[][] = orders.map((order) => [
    order.order_id,
    userId,
    orderItemLabel(order),
    order.amount,
    order.currency,
    order.status,
    order.affiliate_id ?? "",
    order.affiliate_commission ?? "",
    order.created_at ?? "",
  ]);

  const safe = (studentLabel || userId).replace(/[^\w.-]+/g, "_").slice(0, 40);
  downloadExcelCsv(exportStamp(`hols-student-orders-${safe}`), headers, rows);
  return orders.length;
}

export async function exportAffiliateCommissionsExcel(
  affiliateId: string,
  affiliateLabel?: string,
) {
  const earnings = await getAffiliateEarnings(affiliateId, 500);
  const headers = [
    "Order ID",
    "Affiliate ID",
    "Student ID",
    "Plan",
    "Order amount",
    "Commission",
    "Currency",
    "Status",
    "Created at",
    "Total earned (summary)",
    "Pending payout (summary)",
    "Paid out (summary)",
    "Margin %",
  ];

  const items: AffiliateCommissionItem[] = earnings.items ?? [];
  const rows: ExcelCell[][] =
    items.length > 0
      ? items.map((item) => [
          item.order_id,
          affiliateId,
          item.student_user_id ?? "",
          planLabel(item.plan_type),
          item.amount,
          item.commission,
          item.currency,
          item.status,
          item.created_at ?? "",
          earnings.total_earned,
          earnings.pending_payout,
          earnings.paid_out,
          earnings.margin_percent ?? "",
        ])
      : [
          [
            "",
            affiliateId,
            "",
            "",
            "",
            "",
            earnings.currency,
            "",
            "",
            earnings.total_earned,
            earnings.pending_payout,
            earnings.paid_out,
            earnings.margin_percent ?? "",
          ],
        ];

  const safe = (affiliateLabel || affiliateId).replace(/[^\w.-]+/g, "_").slice(0, 40);
  downloadExcelCsv(exportStamp(`hols-affiliate-commissions-${safe}`), headers, rows);
  return items.length;
}
