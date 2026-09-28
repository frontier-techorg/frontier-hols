"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy, Icon } from "@/components/icons";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { DashboardRecentActivity } from "@/components/platform/provider/admin/dashboard/DashboardRecentActivity";
import {
  AffiliateEarningsChart,
  AffiliatePlanMixPie,
  AffiliateWalletPie,
} from "@/components/platform/provider/affiliate/dashboard/AffiliateDashboardCharts";
import { DashboardPageLayout } from "@/components/platform/provider/affiliate/dashboard/DashboardPageLayout";
import { AffiliateWalletCards } from "@/components/platform/provider/affiliate/AffiliateWalletCards";
import {
  formatAffiliatePercent,
  useAffiliateProfile,
} from "@/components/platform/provider/affiliate/affiliateProfile";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getAffiliateDashboard,
  type AffiliateDashboard,
  type DashboardPeriod,
} from "@/lib/integrate/provider/affiliate/dashboard";
import { cn } from "@/lib/utils";

export function AffiliatePortal() {
  const { profile, inviteInfo, refreshing, error: profileError, inviteLink } = useAffiliateProfile();
  const [period, setPeriod] = useState<DashboardPeriod>("weekly");
  const [dashboard, setDashboard] = useState<AffiliateDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const studentCount = inviteInfo?.student_count ?? profile?.student_count ?? dashboard?.student_count ?? 0;
  const inviteCode = inviteInfo?.invite_code ?? profile?.invite_code ?? dashboard?.invite_code;
  const marginPercent = dashboard?.margin_percent ?? profile?.margin_percent;
  const wallet = dashboard?.wallet;
  const currency = wallet?.currency ?? dashboard?.currency ?? "USD";
  const lockDays = dashboard?.payout_lock_days ?? 7;
  const lockSeconds = dashboard?.payout_lock_seconds;
  const error = dashboardError ?? profileError;
  const loading = (refreshing && !profile) || (dashboardLoading && !dashboard);

  useEffect(() => {
    const controller = new AbortController();
    setDashboardLoading(true);
    setDashboardError(null);
    void getAffiliateDashboard(period, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setDashboard(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setDashboard(null);
        setDashboardError(err instanceof ApiRequestError ? err.message : "Failed to load dashboard.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDashboardLoading(false);
      });
    return () => controller.abort();
  }, [period]);

  return (
    <DashboardPageLayout>
      {error ? (
        <div className="col-span-full">
          <AuthAlert variant="error">{error}</AuthAlert>
        </div>
      ) : null}
      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="col-span-full grid min-w-0 gap-3 sm:gap-4">
            <AffiliateWalletCards
              wallet={wallet}
              currency={currency}
              lockDays={lockDays}
              lockSeconds={lockSeconds}
              studentCount={studentCount}
              loading={dashboardLoading}
              order={["pending", "payout", "available", "lock"]}
            />
          </div>

          <div className="col-span-full grid min-w-0 items-stretch gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <AffiliateEarningsChart
              dashboard={dashboard}
              period={period}
              onPeriodChange={setPeriod}
              loading={dashboardLoading}
            />
            <AffiliatePlanMixPie dashboard={dashboard} period={period} />
          </div>

          <div className="col-span-full grid min-w-0 items-start gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <DashboardRecentActivity />
            <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
              <AffiliateWalletPie wallet={wallet} />
              <InviteCard
                inviteCode={inviteCode}
                inviteLink={inviteLink}
                studentCount={studentCount}
                marginPercent={marginPercent}
              />
            </div>
          </div>
        </>
      )}
    </DashboardPageLayout>
  );
}

function InviteCard({
  inviteCode,
  inviteLink,
  studentCount,
  marginPercent,
}: {
  inviteCode?: string | null;
  inviteLink?: string | null;
  studentCount: number;
  marginPercent?: number | null;
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyValue(value: string | null | undefined, field: "code" | "link") {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      return;
    } catch {
      // Some browsers block clipboard.writeText; fall through to a selectable copy.
    }
    try {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(ok ? field : null);
    } catch {
      setCopied(null);
    }
  }

  const code = inviteCode?.trim() || "";
  const link = inviteLink?.trim() || "";

  return (
    <section className="dashboard-glass-card @container relative min-w-0 overflow-hidden rounded-2xl p-3.5 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-text)]/55">
          Invite students
        </p>
        <Link
          href="/affiliate/customers"
          className="text-brand-caption shrink-0 font-medium text-[color:var(--dash-muted)] hover:text-[color:var(--dash-text)]"
        >
          Customers
        </Link>
      </div>

      <p className="text-brand-caption mt-2 text-[color:var(--dash-muted)]">
        {studentCount} referred · {formatAffiliatePercent(marginPercent)} margin
      </p>

      <div className="mt-3 grid min-w-0 gap-2">
        <InviteCopyRow
          label="Code"
          value={code || "Not assigned"}
          displayClassName="font-mono text-base font-bold tracking-[0.12em] sm:text-lg"
          canCopy={Boolean(code)}
          copied={copied === "code"}
          actionLabel="Copy code"
          onCopy={() => void copyValue(code, "code")}
        />
        <InviteCopyRow
          label="Invite link"
          value={link || "Your invite link appears after a code is assigned."}
          displayClassName="text-sm font-medium"
          canCopy={Boolean(link)}
          copied={copied === "link"}
          actionLabel="Copy link"
          onCopy={() => void copyValue(link, "link")}
        />
      </div>
    </section>
  );
}

function InviteCopyRow({
  label,
  value,
  displayClassName,
  canCopy,
  copied,
  actionLabel,
  onCopy,
}: {
  label: string;
  value: string;
  displayClassName: string;
  canCopy: boolean;
  copied: boolean;
  actionLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[color:var(--sidebar-hover)] sm:px-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-brand-caption font-medium text-[color:var(--dash-faint)]">{label}</p>
        <p
          className={cn(
            "font-sans mt-0.5 truncate text-[color:var(--dash-text)]",
            displayClassName,
          )}
          title={value}
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        disabled={!canCopy}
        aria-label={copied ? `${actionLabel} copied` : actionLabel}
        className="dashboard-page-action dashboard-navy-btn font-sans inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-0 text-sm font-medium tracking-[0.01em] text-white disabled:pointer-events-none disabled:opacity-50 @[16rem]:w-auto @[16rem]:px-4"
      >
        <Icon icon={copied ? Check : Copy} size={14} strokeWidth={2} />
        <span className="hidden @[16rem]:inline">{copied ? "Copied" : actionLabel}</span>
      </button>
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <span className={cn("dashboard-skeleton-block", className)} aria-hidden />;
}

function MetricCardSkeleton() {
  return (
    <div className="dashboard-glass-card min-h-11 min-w-0 overflow-hidden rounded-2xl px-2.5 py-2.5 sm:px-3.5 sm:py-3 md:px-4 md:py-4">
      <SkeletonBlock className="h-3 w-16 max-w-full rounded-full" />
      <SkeletonBlock className="mt-2 h-6 w-20 max-w-full rounded-full sm:h-7" />
      <div className="mt-2 hidden md:block">
        <SkeletonBlock className="h-3 w-full max-w-[9rem] rounded-full" />
      </div>
    </div>
  );
}

function PieCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <section className="dashboard-glass-card @container min-w-0 overflow-hidden rounded-2xl p-3.5 sm:p-5">
      <SkeletonBlock className="h-3 w-20 max-w-full rounded-full" />
      <SkeletonBlock className="mt-2 h-5 w-36 max-w-full rounded-full sm:h-6" />
      <div className="mt-4 flex min-w-0 flex-col items-center gap-4 @[20rem]:flex-row @[20rem]:items-center">
        <SkeletonBlock className="h-36 w-36 shrink-0 rounded-full sm:h-44 sm:w-44" />
        <div className="grid w-full min-w-0 flex-1 gap-2.5">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex min-w-0 items-center justify-between gap-3">
              <SkeletonBlock className="h-3 w-20 max-w-[60%] rounded-full" />
              <SkeletonBlock className="h-3.5 w-14 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="col-span-full min-w-0" aria-busy="true" aria-label="Loading dashboard">
        <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <MetricCardSkeleton key={index} />
          ))}
        </div>
      </div>

      <div className="col-span-full grid min-w-0 items-stretch gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <section className="dashboard-glass-card flex min-w-0 flex-col overflow-hidden rounded-2xl p-3.5 sm:p-5">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <SkeletonBlock className="h-3 w-24 max-w-full rounded-full" />
              <SkeletonBlock className="mt-2 h-5 w-28 max-w-full rounded-full sm:h-6" />
            </div>
            <SkeletonBlock className="h-10 w-full rounded-full sm:w-56" />
          </div>
          <SkeletonBlock className="mt-4 h-48 w-full rounded-2xl sm:h-56" />
          <SkeletonBlock className="mt-3 h-3 w-24 max-w-full rounded-full" />
        </section>
        <PieCardSkeleton />
      </div>

      <div className="col-span-full grid min-w-0 items-start gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl p-3.5 sm:p-5">
          <SkeletonBlock className="h-5 w-36 max-w-[60%] rounded-full sm:h-6" />
          <div className="mt-3.5 grid min-w-0 gap-1 sm:mt-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex min-w-0 items-start gap-2.5 rounded-xl px-3 py-2.5">
                <SkeletonBlock className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonBlock className="h-3.5 w-3/5 max-w-full rounded-full" />
                  <SkeletonBlock className="h-3 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <PieCardSkeleton rows={4} />
          <section className="dashboard-glass-card @container min-w-0 overflow-hidden rounded-2xl p-3.5 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <SkeletonBlock className="h-3 w-28 max-w-[50%] rounded-full" />
              <SkeletonBlock className="h-3 w-16 shrink-0 rounded-full" />
            </div>
            <SkeletonBlock className="mt-3 h-3 w-40 max-w-full rounded-full" />
            <div className="mt-3 grid min-w-0 gap-2">
              {Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <SkeletonBlock className="h-3 w-16 max-w-full rounded-full" />
                    <SkeletonBlock className="h-4 w-32 max-w-full rounded-full" />
                  </div>
                  <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full @[16rem]:w-[7.5rem]" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
