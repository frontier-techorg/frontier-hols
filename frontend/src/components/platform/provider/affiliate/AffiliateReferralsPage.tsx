"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Icon, Menu } from "@/components/icons";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import {
  DataField,
  DirectoryMobileRow,
  PaginationControls,
  StatPill,
  StatusBadge,
} from "@/components/platform/provider/admin/shared";
import { affiliateNav } from "@/components/platform/provider/affiliate/affiliateNav";
import { useAffiliateProfile } from "@/components/platform/provider/affiliate/affiliateProfile";
import { SkeletonBlock } from "@/components/platform/provider/student/DashboardSkeletons";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { DashRightDrawer } from "@/components/platform/provider/student/DashRightDrawer";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  listAffiliateReferralStudents,
  sendAffiliateInvites,
  type AffiliateReferralTotals,
} from "@/lib/integrate/provider/affiliate/referrals/api";
import type { StudentSummary } from "@/lib/integrate/provider/admin/users/types";
import {
  formatDate,
  formatMoney,
  planLabels,
  type PlanType,
} from "@/lib/integrate/provider/student/payment/types";
import { cn } from "@/lib/utils";

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "C";
}

function customerName(student: StudentSummary) {
  return [student.first_name, student.last_name].filter(Boolean).join(" ") || "Customer";
}

function planLabel(plan?: string | null) {
  if (!plan) return "No plan";
  return planLabels[plan as PlanType] ?? plan;
}

function membershipLabel(status?: string | null) {
  if (!status) return "None";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const copyIcon = <Icon icon={Copy} size={14} />;
const checkIcon = <Icon icon={Check} size={14} strokeWidth={2} />;

const EMPTY_TOTALS: AffiliateReferralTotals = {
  student_count: 0,
  total_spent: 0,
  affiliate_earned: 0,
  currency: "USD",
};

export function AffiliateReferralsPage() {
  const { profile, inviteInfo, error, setError, inviteLink } = useAffiliateProfile();
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [totals, setTotals] = useState<AffiliateReferralTotals>(EMPTY_TOTALS);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const studentCount = totals.student_count || inviteInfo?.student_count || profile?.student_count || 0;
  const invitationQuota = inviteInfo?.invitation_quota ?? profile?.invitation_quota;
  const currency = totals.currency || "USD";
  const availableQuota =
    invitationQuota == null
      ? "Unlimited"
      : String(Math.max(invitationQuota - studentCount, 0));
  const selected = students.find((student) => student.user_id === selectedId) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      async function loadStudents() {
        setStudentsLoading(true);
        try {
          const data = await listAffiliateReferralStudents({ page, limit: 15 }, controller.signal);
          if (controller.signal.aborted) return;
          setStudents(data.items);
          setTotal(data.pagination.total);
          setHasNext(data.pagination.has_next);
          setHasPrevious(data.pagination.has_previous);
          setTotals({
            student_count: data.totals?.student_count ?? data.pagination.total,
            total_spent: data.totals?.total_spent ?? 0,
            affiliate_earned: data.totals?.affiliate_earned ?? 0,
            currency: data.totals?.currency ?? "USD",
          });
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof ApiRequestError ? err.message : "Failed to load customers.");
        } finally {
          if (!controller.signal.aborted) setStudentsLoading(false);
        }
      }

      void loadStudents();
    }, 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [page, setError]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!inviteSuccess) return;
    const timer = window.setTimeout(() => setInviteSuccess(null), 3500);
    return () => window.clearTimeout(timer);
  }, [inviteSuccess]);

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setError(null);
    } catch {
      setError("Could not copy. Please copy it manually.");
    }
  }

  return (
    <PortalShell
      role="affiliate"
      title="Customers"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={affiliateNav}
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
          <h1 className="font-sans min-w-0 truncate text-lg font-bold leading-none tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
            Customers
          </h1>
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
          {inviteSuccess ? <AuthAlert variant="success">{inviteSuccess}</AuthAlert> : null}

          <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            {studentsLoading && students.length === 0 ? (
              Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl px-3.5 py-3 sm:px-4 sm:py-4"
                >
                  <SkeletonBlock className="h-3 w-16 max-w-full rounded-full" />
                  <SkeletonBlock className="mt-2 h-6 w-20 max-w-full rounded-full" />
                </div>
              ))
            ) : (
              <>
            <StatPill label="Customers" value={String(studentCount)} />
            <StatPill
              label={
                <>
                  <span className="sm:hidden">Spent</span>
                  <span className="hidden sm:inline">Customer spend</span>
                </>
              }
              value={formatMoney(totals.total_spent, currency)}
            />
            <StatPill
              label={
                <>
                  <span className="sm:hidden">Earned</span>
                  <span className="hidden sm:inline">Your earnings</span>
                </>
              }
              value={formatMoney(totals.affiliate_earned, currency)}
            />
            <StatPill label="Available seats" value={availableQuota} />
              </>
            )}
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void copyLink()}
              disabled={!inviteLink}
              className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium tracking-[0.01em] text-[color:var(--dash-text)] disabled:pointer-events-none disabled:opacity-50 sm:flex-none"
            >
              {copied ? checkIcon : copyIcon}
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setInviteSuccess(null);
                setInviteOpen(true);
              }}
              disabled={!inviteLink}
              className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium tracking-[0.01em] text-white disabled:pointer-events-none disabled:opacity-50 sm:flex-none"
            >
              <SidebarSvgIcon name="plus" size={15} strokeWidth={2.2} />
              <span className="sm:hidden">Invite</span>
              <span className="hidden sm:inline">Invite customers</span>
            </button>
          </div>

          <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-end justify-between gap-2 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                  Directory
                </p>
                <h2 className="font-sans mt-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                  Your customers
                </h2>
              </div>
              <p className="text-brand-caption text-[color:var(--dash-faint)]">{total} total</p>
            </div>

            {studentsLoading ? (
              <CustomersDirectorySkeleton />
            ) : students.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center sm:py-14">
                <span className="dashboard-tool-icon flex h-14 w-14 items-center justify-center rounded-full text-[color:var(--dash-text)]">
                  <SidebarSvgIcon name="users" size={22} strokeWidth={1.85} />
                </span>
                <p className="font-sans mt-4 text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
                  No customers yet
                </p>
                <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
                  Share your invite link or send an email invite. Purchases from those customers will
                  show spend and your commission here.
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    setInviteSuccess(null);
                    setInviteOpen(true);
                  }}
                  disabled={!inviteLink}
                  className="lecture-page-action mt-4 px-5"
                >
                  Invite by email
                </Button>
              </div>
            ) : (
              <>
                <ul className="grid gap-2.5 px-3.5 pb-4 sm:gap-3 sm:px-5 md:hidden">
                  {students.map((student) => {
                    const spendCurrency = student.spend_currency || currency;
                    return (
                      <li key={student.user_id} className="min-w-0">
                        <DirectoryMobileRow
                          title={customerName(student)}
                          subtitle={student.email}
                          avatar={initials(student.first_name, student.last_name)}
                          active={selectedId === student.user_id}
                          ariaLabel={`Open ${customerName(student)} details`}
                          onClick={() => setSelectedId(student.user_id)}
                          stats={[
                            { label: "Plan", value: planLabel(student.current_plan) },
                            {
                              label: "Spent",
                              value: formatMoney(student.total_spent ?? 0, spendCurrency),
                            },
                            {
                              label: "Your earnings",
                              value: formatMoney(student.affiliate_earned ?? 0, spendCurrency),
                            },
                            {
                              label: "Orders",
                              value: student.paid_order_count ?? student.order_count ?? 0,
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
                        <th scope="col" className="w-[30%] px-4 py-3 font-semibold sm:px-5">
                          Customer
                        </th>
                        <th scope="col" className="w-[15%] px-3 py-3 font-semibold">
                          Plan
                        </th>
                        <th scope="col" className="w-[15%] px-3 py-3 font-semibold">
                          Spent
                        </th>
                        <th scope="col" className="w-[16%] px-3 py-3 font-semibold">
                          Your earnings
                        </th>
                        <th scope="col" className="w-[12%] px-3 py-3 font-semibold">
                          Orders
                        </th>
                        <th scope="col" className="w-[12%] px-4 py-3 font-semibold sm:px-5">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => {
                        const active = selectedId === student.user_id;
                        const spendCurrency = student.spend_currency || currency;
                        return (
                          <tr
                            key={student.user_id}
                            tabIndex={0}
                            role="button"
                            aria-label={`Open ${customerName(student)} details`}
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
                              <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--dash-soft)] font-sans text-xs font-bold text-[color:var(--dash-text)]">
                                  {initials(student.first_name, student.last_name)}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-sans truncate text-sm font-semibold text-[color:var(--dash-text)]">
                                    {customerName(student)}
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
                                {formatMoney(student.total_spent ?? 0, spendCurrency)}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans block truncate text-sm font-semibold tabular-nums text-[color:var(--dash-accent)]">
                                {formatMoney(student.affiliate_earned ?? 0, spendCurrency)}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
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

                {hasNext || hasPrevious || page > 1 ? (
                  <div className="px-4 pb-4 sm:px-5">
                    <PaginationControls
                      appearance="lecture"
                      page={page}
                      pageCount={Math.max(1, Math.ceil(total / 15))}
                      total={total}
                      hasNext={hasNext}
                      hasPrevious={hasPrevious}
                      loading={studentsLoading}
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
          eyebrow="Customer"
          title={customerName(selected)}
          onClose={() => setSelectedId(null)}
        >
          <CustomerDetailPanel student={selected} currency={currency} />
        </DashRightDrawer>
      ) : null}

      <InviteEmailDialog
        open={inviteOpen}
        inviteLinkReady={Boolean(inviteLink)}
        onClose={() => setInviteOpen(false)}
        onSuccess={(message) => {
          setInviteSuccess(message);
          setInviteOpen(false);
        }}
      />
    </PortalShell>
  );
}

function CustomerDetailPanel({
  student,
  currency,
}: {
  student: StudentSummary;
  currency: string;
}) {
  const spendCurrency = student.spend_currency || currency;
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--dash-soft)] font-sans text-sm font-bold text-[color:var(--dash-text)]">
          {initials(student.first_name, student.last_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-sans break-words text-base font-semibold text-[color:var(--dash-text)]">
            {customerName(student)}
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
              {formatMoney(student.affiliate_earned ?? 0, spendCurrency)}
            </span>
          }
        />
        <DataField label="Orders" value={String(student.paid_order_count ?? student.order_count ?? 0)} />
        <DataField label="Plan" value={planLabel(student.current_plan)} />
        <DataField label="Membership" value={membershipLabel(student.membership_status)} />
        <DataField label="Joined" value={student.created_at ? formatDate(student.created_at) : "—"} />
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
        <DataField label="Marketing" value={student.marketing_pref ? "On" : "Off"} />
      </div>
    </div>
  );
}

function InviteEmailDialog({
  open,
  inviteLinkReady,
  onClose,
  onSuccess,
}: {
  open: boolean;
  inviteLinkReady: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const titleId = useId();
  const emailsRef = useRef<HTMLTextAreaElement>(null);
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmails("");
    setMessage("");
    setLocalError(null);
    setSending(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      emailsRef.current?.focus();
      emailsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 30);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !sending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, sending]);

  if (!open || typeof document === "undefined") return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    const parsed = emails
      .split(/[\s,;]+/)
      .map((email) => email.trim())
      .filter(Boolean);

    if (parsed.length === 0) {
      setLocalError("Add at least one customer email.");
      return;
    }
    if (!inviteLinkReady) {
      setLocalError("Invite link is not ready yet.");
      return;
    }

    setSending(true);
    try {
      const result = await sendAffiliateInvites({
        emails: parsed,
        message: message.trim() || undefined,
      });
      onSuccess(
        `${result.recipient_count} invite email${result.recipient_count === 1 ? "" : "s"} queued.`,
      );
    } catch (err) {
      setLocalError(err instanceof ApiRequestError ? err.message : "Could not send invite emails.");
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div className="adviser-dialog-overlay adviser-dialog-overlay--center fixed inset-0 z-[80] flex min-h-dvh items-end justify-center overflow-y-auto bg-black/45 px-[max(0.75rem,env(safe-area-inset-left))] py-[max(0.75rem,env(safe-area-inset-top),env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:items-center sm:px-4 sm:py-6">
      <button
        type="button"
        aria-label="Close invite dialog"
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!sending) onClose();
        }}
      />

      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="adviser-dialog-panel adviser-dialog-panel--center @container relative z-10 my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md min-w-0 flex-col overflow-hidden rounded-2xl"
        onSubmit={handleSubmit}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--dash-surface-border)] px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4 md:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
              Invite
            </p>
            <h2
              id={titleId}
              className="font-sans mt-1 break-words text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl"
            >
              Invite customers
            </h2>
            <p className="text-brand-body mt-1 break-words text-sm text-[color:var(--dash-muted)] sm:text-base">
              Separate emails with commas, spaces, or new lines.
            </p>
          </div>
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            className="adviser-onboarding-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--dash-text)] transition disabled:pointer-events-none disabled:opacity-50"
            aria-label="Close invite customers"
          >
            <SidebarSvgIcon name="cross" size={22} strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5 md:px-6">
          {localError ? <AuthAlert variant="error">{localError}</AuthAlert> : null}

          <label className="grid min-w-0 gap-2">
            <span className="dashboard-field-label">Customer emails</span>
            <textarea
              ref={emailsRef}
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
              rows={3}
              required
              disabled={sending}
              placeholder="student@example.com, another@example.com"
              className="dashboard-field min-h-[5.5rem] min-w-0 max-w-full resize-y px-4 py-3"
            />
          </label>
          <label className="grid min-w-0 gap-2">
            <span className="dashboard-field-label">Optional message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={2}
              maxLength={500}
              disabled={sending}
              placeholder="Add a short personal note"
              className="dashboard-field min-h-[4rem] min-w-0 max-w-full resize-y px-4 py-3"
            />
          </label>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[color:var(--dash-surface-border)] px-4 py-3.5 @min-[22rem]:flex-row @min-[22rem]:justify-end @min-[22rem]:gap-2.5 sm:px-5 sm:py-4 md:px-6">
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium text-[color:var(--dash-text)] disabled:pointer-events-none disabled:opacity-50 @min-[22rem]:w-auto"
          >
            Cancel
          </button>
          <Button
            type="submit"
            disabled={sending || !inviteLinkReady}
            className="lecture-page-action w-full px-5 @min-[22rem]:w-auto"
          >
            {sending ? (
              <>
                <SidebarSvgIcon name="spinner" size={16} strokeWidth={2.5} className="animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <SidebarSvgIcon name="mail" size={15} strokeWidth={2.2} />
                Send invites
              </>
            )}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function CustomersDirectorySkeleton() {
  const columns = ["w-[30%]", "w-[15%]", "w-[15%]", "w-[16%]", "w-[12%]", "w-[12%]"];

  return (
    <div aria-busy="true" aria-label="Loading customers">
      <ul className="grid gap-2.5 px-3.5 pb-4 sm:gap-3 sm:px-5 md:hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="min-w-0 overflow-hidden rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-3.5 w-[62%] max-w-full rounded-full" />
                <SkeletonBlock className="h-3 w-[78%] max-w-full rounded-full" />
              </div>
              <SkeletonBlock className="h-4 w-4 shrink-0 rounded-full" />
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
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
                <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <SkeletonBlock className="h-9 w-9 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <SkeletonBlock className="h-3.5 w-[70%] max-w-full rounded-full" />
                      <SkeletonBlock className="h-3 w-[86%] max-w-full rounded-full" />
                    </div>
                  </div>
                </td>
                {columns.slice(1).map((width, cell) => (
                  <td key={cell} className={cn("border-t border-[color:var(--dash-surface-border)] px-3 py-3", width)}>
                    <SkeletonBlock className="h-4 w-14 max-w-full rounded-full" />
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
