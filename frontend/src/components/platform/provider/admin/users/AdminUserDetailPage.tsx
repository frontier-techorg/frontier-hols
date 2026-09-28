"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Icon, Menu } from "@/components/icons";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { adminNav } from "@/components/platform/provider/admin/adminNav";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { PaginationControls } from "@/components/platform/provider/admin/shared";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { Button } from "@/components/ui/Button";
import { ApiRequestError } from "@/lib/integrate/client";
import type { UserRole } from "@/lib/integrate/auth/types";
import {
  getUserProfile,
  updateUserProfile,
  type AdminProfile,
  type ProfileAccess,
} from "@/lib/integrate/provider/admin/profile/api";
import {
  getAffiliateEarnings,
  getStudentCommerce,
  listStudentOrders,
  type AffiliateEarningsSummary,
  type StudentCommerceSummary,
} from "@/lib/integrate/provider/admin/users/api";
import {
  exportAffiliateCommissionsExcel,
  exportStudentOrdersExcel,
} from "@/lib/integrate/provider/admin/users/exportPayments";
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

type AdminUserDetailPageProps = {
  userId: string;
};

const ORDERS_PAGE_SIZE = 8;

function orderStatusLabel(status: string) {
  if (status === "paid") return "Paid";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  if (status === "refunded") return "Refunded";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type FormState = {
  first_name: string;
  last_name: string;
  marketing_pref: boolean;
  margin_percent: string;
  invite_code: string;
  invitation_quota: string;
  role: UserRole;
};

function profileToForm(profile: AdminProfile): FormState {
  return {
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    marketing_pref: Boolean(profile.marketing_pref),
    margin_percent: profile.margin_percent != null ? String(profile.margin_percent) : "",
    invite_code: profile.invite_code ?? "",
    invitation_quota: profile.invitation_quota != null ? String(profile.invitation_quota) : "",
    role: (profile.role as UserRole) ?? "student",
  };
}

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

function initials(profile: AdminProfile | null) {
  const first = profile?.first_name?.[0] ?? "";
  const last = profile?.last_name?.[0] ?? "";
  return `${first}${last}`.toUpperCase() || "U";
}

function DashField({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  min,
  step,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: string | number;
  step?: string | number;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={id} className="dashboard-field-label">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        min={min}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className="dashboard-field"
      />
    </div>
  );
}

function UserDetailSkeleton() {
  return (
    <div className="grid w-full min-w-0 gap-3 sm:gap-4" aria-busy="true" aria-label="Loading profile">
      <section className="dashboard-hero overflow-hidden rounded-2xl p-3.5 sm:p-5 md:p-6">
        <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
          <span className="dashboard-skeleton-block h-14 w-14 shrink-0 rounded-2xl sm:h-20 sm:w-20" />
          <div className="flex w-full min-w-0 flex-col items-center gap-2 sm:items-start">
            <span className="dashboard-skeleton-block h-3 w-28 max-w-full rounded-full" />
            <span className="dashboard-skeleton-block h-7 w-48 max-w-full rounded-full sm:h-8" />
            <span className="dashboard-skeleton-block h-3.5 w-56 max-w-full rounded-full" />
          </div>
        </div>
      </section>
      <section className="dashboard-surface min-w-0 rounded-2xl p-3.5 sm:p-5 md:p-6">
        <span className="dashboard-skeleton-block block h-3 w-16 rounded-full" />
        <span className="dashboard-skeleton-block mt-2 block h-5 w-24 rounded-full" />
        <div className="mt-4 grid gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex min-w-0 items-center justify-between gap-3">
              <span className="dashboard-skeleton-block h-3 w-20 max-w-[40%] rounded-full" />
              <span className="dashboard-skeleton-block h-3.5 w-32 max-w-[50%] rounded-full" />
            </div>
          ))}
        </div>
      </section>
      <section className="dashboard-surface min-w-0 rounded-2xl p-3.5 sm:p-5 md:p-6">
        <span className="dashboard-skeleton-block block h-3 w-20 rounded-full" />
        <span className="dashboard-skeleton-block mt-2 block h-5 w-44 max-w-full rounded-full" />
        <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className="dashboard-skeleton-block h-16 rounded-xl" />
          ))}
        </div>
        <MoneyRowsSkeleton columns={["w-[18%]", "w-[22%]", "w-[16%]", "w-[14%]", "w-[14%]", "w-[16%]"]} />
      </section>
    </div>
  );
}

function MoneyRowsSkeleton({ columns }: { columns: string[] }) {
  return (
    <div className="mt-5">
      <ul className="grid gap-2.5 md:hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="min-w-0 rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4">
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
          </li>
        ))}
      </ul>
      <div className="hidden min-w-0 overflow-x-hidden md:block">
        <table className="w-full table-fixed border-separate border-spacing-0 text-left">
          <thead>
            <tr className="bg-[color:var(--dash-soft)]">
              {columns.map((width, index) => (
                <th key={index} className={cn("px-3 py-3 first:px-5", width)}>
                  <span className="dashboard-skeleton-block block h-3 w-16 max-w-full rounded-full" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }, (_, index) => (
              <tr key={index}>
                {columns.map((width, cell) => (
                  <td
                    key={cell}
                    className={cn(
                      "border-t border-[color:var(--dash-surface-border)] px-3 py-3 first:px-5 last:pr-5",
                      width,
                    )}
                  >
                    <span className="dashboard-skeleton-block block h-4 w-16 max-w-full rounded-full" />
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

export function AdminUserDetailPage({ userId }: AdminUserDetailPageProps) {
  const searchParams = useSearchParams();
  const focusOrder = searchParams.get("order")?.trim() || "";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [access, setAccess] = useState<ProfileAccess | null>(null);
  const [form, setForm] = useState<FormState>(profileToForm({ role: "student" } as AdminProfile));
  const [commerce, setCommerce] = useState<StudentCommerceSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersHasNext, setOrdersHasNext] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [earnings, setEarnings] = useState<AffiliateEarningsSummary | null>(null);
  const [moneyLoading, setMoneyLoading] = useState(false);
  const [moneyError, setMoneyError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      setCommerce(null);
      setOrders([]);
      setEarnings(null);
      setOrdersPage(1);

      try {
        const data = await getUserProfile(userId);
        const nextProfile = data.profile as AdminProfile;
        setProfile(nextProfile);
        setAccess(data.access as ProfileAccess);
        setForm(profileToForm(nextProfile));
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Failed to load user profile.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [userId]);

  useEffect(() => {
    if (!focusOrder) return;
    const nodes = Array.from(
      document.querySelectorAll(`[data-order-id="${CSS.escape(focusOrder)}"]`),
    );
    const node =
      nodes.find((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }) ?? nodes[0];
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusOrder, orders]);

  const loadStudentMoney = useCallback(
    async (pageNum: number) => {
      setMoneyLoading(true);
      setOrdersLoading(true);
      setMoneyError(null);
      try {
        const [commerceData, orderData] = await Promise.all([
          getStudentCommerce(userId),
          listStudentOrders(userId, { page: pageNum, limit: ORDERS_PAGE_SIZE }),
        ]);
        setCommerce(commerceData);
        setOrders(orderData.items);
        setOrdersTotal(orderData.pagination.total);
        setOrdersHasNext(orderData.pagination.has_next);
        setOrdersPage(pageNum);
      } catch (err) {
        setMoneyError(
          err instanceof ApiRequestError ? err.message : "Failed to load purchase history.",
        );
      } finally {
        setMoneyLoading(false);
        setOrdersLoading(false);
      }
    },
    [userId],
  );

  const loadAffiliateMoney = useCallback(async () => {
    setMoneyLoading(true);
    setMoneyError(null);
    try {
      setEarnings(await getAffiliateEarnings(userId, 25));
    } catch (err) {
      setMoneyError(
        err instanceof ApiRequestError ? err.message : "Failed to load affiliate earnings.",
      );
    } finally {
      setMoneyLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!profile) return;
    if (profile.role === "student") {
      void loadStudentMoney(1);
    } else if (profile.role === "affiliate") {
      void loadAffiliateMoney();
    }
  }, [profile, loadStudentMoney, loadAffiliateMoney]);

  async function handleExportPayments() {
    if (!profile) return;
    setExporting(true);
    setMoneyError(null);
    const label = `${profile.first_name ?? ""}-${profile.last_name ?? ""}`.trim() || profile.email;
    try {
      if (profile.role === "student") {
        await exportStudentOrdersExcel(userId, label);
      } else if (profile.role === "affiliate") {
        await exportAffiliateCommissionsExcel(userId, label);
      }
    } catch (err) {
      setMoneyError(
        err instanceof ApiRequestError ? err.message : "Failed to export payment details.",
      );
    } finally {
      setExporting(false);
    }
  }

  function canEdit(field: string) {
    return access?.editable_fields.includes(field) ?? false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!access?.can_edit || profile?.role === "student") return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload: Record<string, unknown> = {};

    if (canEdit("first_name")) payload.first_name = form.first_name.trim();
    if (canEdit("last_name")) payload.last_name = form.last_name.trim();
    if (canEdit("marketing_pref")) payload.marketing_pref = form.marketing_pref;
    if (canEdit("margin_percent") && form.margin_percent.trim()) {
      payload.margin_percent = Number(form.margin_percent);
    }
    if (canEdit("invite_code")) payload.invite_code = form.invite_code.trim() || undefined;
    if (canEdit("invitation_quota") && form.invitation_quota.trim()) {
      payload.invitation_quota = Number(form.invitation_quota);
    }
    if (canEdit("role")) payload.role = form.role;

    try {
      const data = await updateUserProfile(userId, payload);
      const nextProfile = data.profile as AdminProfile;
      setProfile(nextProfile);
      setAccess(data.access as ProfileAccess);
      setForm(profileToForm(nextProfile));
      setSuccess("User profile updated.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not update user profile.");
    } finally {
      setSaving(false);
    }
  }

  const fullName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "User profile"
    : "User profile";
  const isStudent = profile?.role === "student";
  // Student profiles are view-only from the admin directory.
  const allowEdit = Boolean(access?.can_edit) && !isStudent;
  const fromWebinarId =
    searchParams.get("from") === "webinar" ? searchParams.get("webinar")?.trim() || "" : "";
  const backHref = fromWebinarId
    ? `/admin/webinars/${encodeURIComponent(fromWebinarId)}`
    : profile?.role === "affiliate"
      ? "/admin/affiliates"
      : "/admin/students";
  const backLabelFull = fromWebinarId
    ? "Back to webinar"
    : profile?.role === "affiliate"
      ? "Back to affiliates"
      : "Back to students";
  const backLabelShort = fromWebinarId
    ? "Webinar"
    : profile?.role === "affiliate"
      ? "Affiliates"
      : "Students";

  return (
    <PortalShell
      role="admin"
      title="User Profile"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={adminNav}
    >
      <div className="dashboard-screen profile-page orders-page min-w-0 overflow-x-hidden">
        <header className="mb-4 flex min-h-10 min-w-0 items-center gap-2 sm:mb-5 sm:min-h-12 sm:gap-3 md:gap-4">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={openSidebar}
            className="dashboard-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full lg:hidden sm:h-12 sm:w-12"
          >
            <Icon icon={Menu} size={18} />
          </button>
          <Link
            href={backHref}
            aria-label={backLabelFull}
            className="lecture-back-btn flex h-10 w-8 shrink-0 items-center justify-center rounded-full no-underline"
          >
            <SidebarSvgIcon name="back" size={32} className="lecture-back-mark" />
          </Link>
          <h1 className="font-sans min-w-0 flex-1 truncate text-lg font-bold leading-none tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
            User profile
          </h1>
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
          {moneyError ? <AuthAlert variant="error">{moneyError}</AuthAlert> : null}
          {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

          {loading ? (
            <UserDetailSkeleton />
          ) : (
            <>
              <section className="dashboard-hero relative overflow-hidden rounded-2xl p-3.5 sm:p-5 md:p-6">
                <div className="flex flex-col gap-3.5 sm:gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white/70 bg-white/40 font-sans text-sm font-bold text-[color:var(--dash-text)] sm:h-20 sm:w-20 sm:text-lg">
                      {profile?.profile_pic ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profile.profile_pic} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials(profile)
                      )}
                    </span>
                    <div className="min-w-0 flex-1 text-center sm:text-left">
                      <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-text)]/55">
                        Managed account
                      </p>
                      <div className="mt-1.5 flex flex-col items-center gap-1.5 sm:mt-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-2">
                        <span className="font-sans max-w-full break-words text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-2xl md:text-[2.25rem] md:leading-none">
                          {fullName}
                        </span>
                        <span className="inline-flex rounded-full bg-[#DDE466]/25 px-2.5 py-0.5 text-brand-caption font-semibold capitalize text-[color:var(--dash-accent)]">
                          {profile?.role || "user"}
                        </span>
                      </div>
                      <p className="text-brand-body mt-1.5 break-all text-[color:var(--dash-muted)] sm:mt-2 sm:truncate sm:break-normal">
                        {profile?.email}
                      </p>
                      {profile?.created_at ? (
                        <p className="text-brand-caption mt-1 text-[color:var(--dash-faint)]">
                          Joined {formatDate(profile.created_at)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <Link
                    href={backHref}
                    className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium text-[color:var(--dash-text)] sm:w-auto lg:shrink-0"
                  >
                    <span className="sm:hidden">{backLabelShort}</span>
                    <span className="hidden sm:inline">{backLabelFull}</span>
                  </Link>
                </div>
              </section>

              <div
                className={cn(
                  "grid w-full min-w-0 items-start gap-3 sm:gap-4",
                  allowEdit && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]",
                )}
              >
                <section className="dashboard-surface order-2 min-w-0 rounded-2xl p-3.5 sm:p-5 md:p-6 lg:order-1">
                  <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                    Account
                  </p>
                  <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                    Details
                  </h2>
                  <div className="mt-3 space-y-2 sm:mt-4 sm:space-y-2.5">
                    <DetailRow label="Email" value={profile?.email} />
                    <DetailRow label="Role" value={<span className="capitalize">{profile?.role}</span>} />
                    <DetailRow label="Joined" value={formatDate(profile?.created_at)} />
                    {profile?.student_count != null ? (
                      <DetailRow label="Student count" value={String(profile.student_count)} />
                    ) : null}
                    {profile?.invitation_quota != null ? (
                      <DetailRow label="Invitation quota" value={String(profile.invitation_quota)} />
                    ) : null}
                    {profile?.margin_percent != null ? (
                      <DetailRow label="Margin" value={`${profile.margin_percent}%`} />
                    ) : null}
                    {profile?.invite_code ? (
                      <DetailRow label="Invite code" value={profile.invite_code} />
                    ) : null}
                    {profile?.referred_by_affiliate_id ? (
                      <DetailRow label="Referred by" value={profile.referred_by_affiliate_id} />
                    ) : null}
                    <DetailRow
                      label="Marketing"
                      value={profile?.marketing_pref ? "Subscribed" : "Off"}
                    />
                  </div>
                </section>

                {allowEdit ? (
                  <section className="dashboard-surface order-1 min-w-0 rounded-2xl p-3.5 sm:p-5 md:p-6 lg:order-2">
                    <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                      Edit
                    </p>
                    <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg md:text-xl">
                      Update fields
                    </h2>
                    <p className="text-brand-body mt-1 break-words text-sm text-[color:var(--dash-muted)] [overflow-wrap:anywhere]">
                      Editable: {access?.editable_fields.join(", ")}
                    </p>

                    <form className="mt-4 grid gap-3 sm:mt-5 sm:gap-4" onSubmit={handleSubmit}>
                      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                        {canEdit("first_name") ? (
                          <DashField
                            id="first-name"
                            label="First name"
                            value={form.first_name}
                            required
                            onChange={(value) => setForm((prev) => ({ ...prev, first_name: value }))}
                          />
                        ) : null}
                        {canEdit("last_name") ? (
                          <DashField
                            id="last-name"
                            label="Last name"
                            value={form.last_name}
                            required
                            onChange={(value) => setForm((prev) => ({ ...prev, last_name: value }))}
                          />
                        ) : null}
                      </div>

                      {canEdit("margin_percent") ? (
                        <DashField
                          id="margin-percent"
                          label="Margin percent"
                          type="number"
                          step="0.01"
                          value={form.margin_percent}
                          onChange={(value) => setForm((prev) => ({ ...prev, margin_percent: value }))}
                        />
                      ) : null}

                      {canEdit("invite_code") ? (
                        <DashField
                          id="invite-code"
                          label="Invite code"
                          value={form.invite_code}
                          onChange={(value) => setForm((prev) => ({ ...prev, invite_code: value }))}
                        />
                      ) : null}

                      {canEdit("invitation_quota") ? (
                        <DashField
                          id="invitation-quota"
                          label="Invitation quota"
                          type="number"
                          min={0}
                          value={form.invitation_quota}
                          onChange={(value) =>
                            setForm((prev) => ({ ...prev, invitation_quota: value }))
                          }
                        />
                      ) : null}

                      {canEdit("role") ? (
                        <ProfileSelect
                          id="role"
                          label="Role"
                          value={form.role}
                          onChange={(value) =>
                            setForm((prev) => ({
                              ...prev,
                              role:
                                value === "affiliate" || value === "admin" ? value : "student",
                            }))
                          }
                          options={[
                            { value: "student", label: "Student" },
                            { value: "affiliate", label: "Affiliate" },
                            { value: "admin", label: "Admin" },
                          ]}
                        />
                      ) : null}

                      {canEdit("marketing_pref") ? (
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] px-3 py-3 sm:px-3.5">
                          <input
                            type="checkbox"
                            checked={form.marketing_pref}
                            onChange={(e) =>
                              setForm((prev) => ({ ...prev, marketing_pref: e.target.checked }))
                            }
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[color:var(--dash-dim)] accent-[#DDE466]"
                          />
                          <span className="min-w-0">
                            <span className="font-sans block text-sm font-medium text-[color:var(--dash-text)]">
                              Marketing emails enabled
                            </span>
                          </span>
                        </label>
                      ) : null}

                      <div className="mt-1 flex flex-col-reverse gap-2 border-t border-[color:var(--dash-surface-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <Link
                          href={backHref}
                          className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium text-[color:var(--dash-text)] sm:w-auto"
                        >
                          <span className="sm:hidden">{backLabelShort}</span>
                          <span className="hidden sm:inline">{backLabelFull}</span>
                        </Link>
                        <Button
                          type="submit"
                          disabled={saving}
                          className="lecture-page-action w-full px-5 sm:w-auto"
                        >
                          {saving ? "Saving…" : "Save changes"}
                        </Button>
                      </div>
                    </form>
                  </section>
                ) : !isStudent ? (
                  <section className="dashboard-surface order-1 min-w-0 rounded-2xl p-4 sm:p-5 lg:order-2">
                    <AuthAlert variant="info">You do not have permission to edit this profile.</AuthAlert>
                  </section>
                ) : null}
              </div>

              {isStudent ? (
                <section className="dashboard-surface min-w-0 rounded-2xl p-3.5 sm:p-5 md:p-6">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                        Purchases
                      </p>
                      <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                        Spend &amp; order history
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-brand-caption font-medium text-[color:var(--dash-accent)]">
                        {moneyLoading && !commerce
                          ? "Loading…"
                          : `${ordersTotal} ${ordersTotal === 1 ? "order" : "orders"}`}
                      </span>
                      <button
                        type="button"
                        disabled={exporting || moneyLoading}
                        onClick={() => void handleExportPayments()}
                        className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-[color:var(--dash-text)] disabled:pointer-events-none disabled:opacity-55"
                      >
                        {exporting ? "Exporting…" : "Export Excel"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2.5 grid-cols-2 lg:grid-cols-4">
                    <MoneyStat
                      label="Total spent"
                      value={
                        commerce
                          ? formatMoney(commerce.total_spent, commerce.currency)
                          : "—"
                      }
                    />
                    <MoneyStat
                      label="Current plan"
                      value={
                        commerce?.current_plan
                          ? planLabels[commerce.current_plan as PlanType] ?? commerce.current_plan
                          : "No plan"
                      }
                    />
                    <MoneyStat
                      label="Paid orders"
                      value={commerce ? String(commerce.paid_order_count) : "—"}
                    />
                    <MoneyStat
                      label="Last purchase"
                      value={
                        commerce?.last_purchase_at
                          ? formatDate(commerce.last_purchase_at)
                          : "—"
                      }
                    />
                  </div>

                  <div className="mt-5">
                    {ordersLoading && orders.length === 0 ? (
                      <MoneyRowsSkeleton
                        columns={["w-[18%]", "w-[22%]", "w-[16%]", "w-[14%]", "w-[14%]", "w-[16%]"]}
                      />
                    ) : orders.length === 0 ? (
                      <p className="text-brand-body py-6 text-center text-[color:var(--dash-faint)]">
                        No purchases on this account yet.
                      </p>
                    ) : (
                      <>
                        <ul className="grid gap-2.5 md:hidden">
                          {orders.map((order) => (
                            <li
                              data-order-id={order.order_id}
                              key={order.order_id}
                              className={cn(
                                "min-w-0 rounded-2xl px-4 py-4",
                                focusOrder === order.order_id
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
                                    {orderStatusLabel(order.status)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[color:var(--dash-faint)]">Amount</dt>
                                  <dd className="mt-0.5 font-semibold text-[color:var(--dash-amount)]">
                                    {formatMoney(order.amount, order.currency)}
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
                        <div className="hidden min-w-0 overflow-x-hidden md:block">
                          <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                            <thead>
                              <tr className="bg-[color:var(--dash-soft)] text-brand-caption font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]">
                                <th scope="col" className="w-[18%] px-4 py-3 font-semibold sm:px-5">
                                  Order ID
                                </th>
                                <th scope="col" className="w-[22%] px-3 py-3 font-semibold">
                                  Plan
                                </th>
                                <th scope="col" className="w-[16%] px-3 py-3 font-semibold">
                                  Type
                                </th>
                                <th scope="col" className="w-[14%] px-3 py-3 font-semibold">
                                  Status
                                </th>
                                <th scope="col" className="w-[14%] px-3 py-3 font-semibold">
                                  Amount
                                </th>
                                <th scope="col" className="w-[16%] px-4 py-3 font-semibold sm:px-5">
                                  Date
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {orders.map((order) => (
                                <tr
                                  data-order-id={order.order_id}
                                  key={order.order_id}
                                  className={cn(
                                    "orders-table-row outline-none transition",
                                    focusOrder === order.order_id
                                      ? "bg-[color:var(--dash-accent-soft,var(--dash-soft))]"
                                      : "hover:bg-[color:var(--dash-soft)]",
                                  )}
                                >
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                                    <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                      #{order.order_id.slice(0, 10)}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                                    <span className="font-sans block truncate text-sm font-semibold text-[color:var(--dash-text)]">
                                      {orderPlanName(order)}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                                    <span className="text-brand-caption block truncate font-medium text-[color:var(--dash-muted)]">
                                      {orderKindLabel(order)}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                                    <span className="text-brand-caption inline-flex max-w-full truncate rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 font-semibold text-[color:var(--dash-text)]">
                                      {orderStatusLabel(order.status)}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                                    <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-amount)]">
                                      {formatMoney(order.amount, order.currency)}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                                    <span className="text-brand-caption block truncate text-[color:var(--dash-muted)]">
                                      {formatDate(order.created_at)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  {(ordersHasNext || ordersPage > 1) ? (
                    <div className="mt-4">
                      <PaginationControls
                        appearance="lecture"
                        page={ordersPage}
                        total={ordersTotal}
                        pageCount={Math.max(1, Math.ceil(ordersTotal / ORDERS_PAGE_SIZE))}
                        hasNext={ordersHasNext}
                        hasPrevious={ordersPage > 1}
                        loading={ordersLoading}
                        onPrevious={() => void loadStudentMoney(ordersPage - 1)}
                        onNext={() => void loadStudentMoney(ordersPage + 1)}
                      />
                    </div>
                  ) : null}
                </section>
              ) : null}

              {profile?.role === "affiliate" ? (
                <section className="dashboard-surface min-w-0 rounded-2xl p-3.5 sm:p-5 md:p-6">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                        Earnings
                      </p>
                      <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                        Commission line items
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-brand-caption font-medium text-[color:var(--dash-accent)]">
                        {moneyLoading && !earnings
                          ? "Loading…"
                          : `${earnings?.order_count ?? 0} commissionable`}
                      </span>
                      <button
                        type="button"
                        disabled={exporting || moneyLoading}
                        onClick={() => void handleExportPayments()}
                        className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-[color:var(--dash-text)] disabled:pointer-events-none disabled:opacity-55"
                      >
                        {exporting ? "Exporting…" : "Export Excel"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2.5 grid-cols-2 lg:grid-cols-4">
                    <MoneyStat
                      label="Total earned"
                      value={
                        earnings
                          ? formatMoney(earnings.total_earned, earnings.currency)
                          : "—"
                      }
                    />
                    <MoneyStat
                      label="Pending payout"
                      value={
                        earnings
                          ? formatMoney(earnings.pending_payout, earnings.currency)
                          : "—"
                      }
                    />
                    <MoneyStat
                      label="Margin"
                      value={
                        earnings?.margin_percent != null
                          ? `${earnings.margin_percent}%`
                          : "—"
                      }
                    />
                    <MoneyStat
                      label="Paid orders"
                      value={earnings ? String(earnings.order_count) : "—"}
                    />
                  </div>

                  <div className="mt-5">
                    {moneyLoading && !earnings ? (
                      <MoneyRowsSkeleton
                        columns={["w-[16%]", "w-[16%]", "w-[14%]", "w-[14%]", "w-[16%]", "w-[14%]", "w-[10%]"]}
                      />
                    ) : !earnings?.items.length ? (
                      <p className="text-brand-body py-6 text-center text-[color:var(--dash-faint)]">
                        No commissionable orders yet.
                      </p>
                    ) : (
                      <>
                        <ul className="grid gap-2.5 md:hidden">
                          {earnings.items.map((item) => (
                            <li
                              key={item.order_id}
                              className="min-w-0 rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4"
                            >
                              <p className="font-sans truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                #{item.order_id.slice(0, 10)}
                              </p>
                              <p className="text-brand-caption mt-1 text-[color:var(--dash-muted)]">
                                {item.plan_type
                                  ? planLabels[item.plan_type as PlanType] ?? item.plan_type
                                  : "Order"}
                              </p>
                              <dl className="mt-3 grid grid-cols-2 gap-2 text-brand-caption">
                                <div>
                                  <dt className="text-[color:var(--dash-faint)]">Status</dt>
                                  <dd className="mt-0.5 font-semibold text-[color:var(--dash-text)]">
                                    {orderStatusLabel(item.status)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[color:var(--dash-faint)]">Commission</dt>
                                  <dd className="mt-0.5 font-semibold text-[color:var(--dash-amount)]">
                                    +{formatMoney(item.commission, item.currency)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[color:var(--dash-faint)]">Order</dt>
                                  <dd className="mt-0.5 font-medium text-[color:var(--dash-muted)]">
                                    {formatMoney(item.amount, item.currency)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-[color:var(--dash-faint)]">Date</dt>
                                  <dd className="mt-0.5 font-medium text-[color:var(--dash-muted)]">
                                    {formatDate(item.created_at)}
                                  </dd>
                                </div>
                                {item.student_user_id ? (
                                  <div className="col-span-2 flex items-end">
                                    <Link
                                      href={`/admin/users/${encodeURIComponent(item.student_user_id)}`}
                                      className="portal-action-link"
                                    >
                                      Student
                                    </Link>
                                  </div>
                                ) : null}
                              </dl>
                            </li>
                          ))}
                        </ul>
                        <div className="hidden min-w-0 overflow-x-hidden md:block">
                          <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                            <thead>
                              <tr className="bg-[color:var(--dash-soft)] text-brand-caption font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]">
                                <th scope="col" className="w-[16%] px-4 py-3 font-semibold sm:px-5">
                                  Order ID
                                </th>
                                <th scope="col" className="w-[16%] px-3 py-3 font-semibold">
                                  Plan
                                </th>
                                <th scope="col" className="w-[14%] px-3 py-3 font-semibold">
                                  Status
                                </th>
                                <th scope="col" className="w-[14%] px-3 py-3 font-semibold">
                                  Order
                                </th>
                                <th scope="col" className="w-[16%] px-3 py-3 font-semibold">
                                  Commission
                                </th>
                                <th scope="col" className="w-[14%] px-3 py-3 font-semibold">
                                  Date
                                </th>
                                <th scope="col" className="w-[10%] px-4 py-3 font-semibold sm:px-5">
                                  Action
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {earnings.items.map((item) => (
                                <tr
                                  key={item.order_id}
                                  className="orders-table-row outline-none transition hover:bg-[color:var(--dash-soft)]"
                                >
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                                    <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                      #{item.order_id.slice(0, 10)}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                                    <span className="font-sans block truncate text-sm font-semibold text-[color:var(--dash-text)]">
                                      {item.plan_type
                                        ? planLabels[item.plan_type as PlanType] ?? item.plan_type
                                        : "Order"}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                                    <span className="text-brand-caption inline-flex max-w-full truncate rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 font-semibold text-[color:var(--dash-text)]">
                                      {orderStatusLabel(item.status)}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                                    <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                      {formatMoney(item.amount, item.currency)}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                                    <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-amount)]">
                                      +{formatMoney(item.commission, item.currency)}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                                    <span className="text-brand-caption block truncate text-[color:var(--dash-muted)]">
                                      {formatDate(item.created_at)}
                                    </span>
                                  </td>
                                  <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                                    {item.student_user_id ? (
                                      <Link
                                        href={`/admin/users/${encodeURIComponent(item.student_user_id)}`}
                                        className="portal-action-link"
                                      >
                                        Student
                                      </Link>
                                    ) : (
                                      <span className="text-brand-caption text-[color:var(--dash-faint)]">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

function MoneyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)]/35 px-3 py-3">
      <p className="text-brand-caption font-medium text-[color:var(--dash-faint)]">{label}</p>
      <p className="font-sans mt-1 text-sm font-semibold tracking-[0.01em] text-[color:var(--dash-text)]">
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="dashboard-row flex min-w-0 flex-col items-start gap-1 rounded-xl px-2.5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-3.5 sm:py-3">
      <p className="text-brand-caption shrink-0 font-medium text-[color:var(--dash-faint)]">{label}</p>
      <div className="font-sans min-w-0 w-full break-words text-sm font-medium text-[color:var(--dash-text)] [overflow-wrap:anywhere] sm:w-auto sm:text-right">
        {value || "—"}
      </div>
    </div>
  );
}
