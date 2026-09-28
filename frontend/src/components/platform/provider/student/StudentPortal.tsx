"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DashboardPageLayout } from "@/components/platform/provider/student/dashboard/DashboardPageLayout";
import { WebinarCoverVisual } from "@/components/platform/provider/student/dashboard/WebinarCoverVisual";
import {
  SidebarSvgIcon,
  type SidebarIconName,
} from "@/components/platform/provider/sidebar-icons";
import {
  getCurrentMembership,
  listOrders,
  listPlans,
} from "@/lib/integrate/provider/student/payment/api";
import type { Order } from "@/lib/integrate/provider/student/payment/types";
import {
  formatDate,
  formatMoney,
  orderItemLabel,
  planLabels,
} from "@/lib/integrate/provider/student/payment/types";
import { listWebinars, type WebinarSummary } from "@/lib/integrate/provider/student/webinars/api";
import { formatWebinarWhen } from "@/lib/integrate/provider/student/webinars/types";
import { cn } from "@/lib/utils";

type QuickTool = {
  label: string;
  href: string;
  icon: SidebarIconName;
};

type QuickLink = {
  label: string;
  href: string;
  icon: SidebarIconName;
  badge?: "plans" | "webinars";
};

const QUICK_TOOLS: readonly QuickTool[] = [
  {
    label: "Lectures",
    href: "/student/lectures",
    icon: "lectures",
  },
  {
    label: "Webinars",
    href: "/student/webinars",
    icon: "webinars",
  },
  {
    label: "Calculator",
    href: "/student/calculator",
    icon: "calculator",
  },
  {
    label: "Advisor",
    href: "/student/adviser",
    icon: "adviser",
  },
];

const QUICK_LINKS: readonly QuickLink[] = [
  {
    label: "Membership plans",
    href: "/student/plans",
    icon: "plans",
    badge: "plans",
  },
  {
    label: "Webinars",
    href: "/student/webinars",
    icon: "webinars",
    badge: "webinars",
  },
  {
    label: "Order history",
    href: "/student/profile/orders",
    icon: "orders",
  },
  {
    label: "Account profile",
    href: "/student/profile",
    icon: "profile",
  },
];

function startOfLocalDay(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function membershipDayStats(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const from = startOfLocalDay(start);
  const to = startOfLocalDay(end);
  const today = startOfLocalDay(new Date());
  if (!from || !to || !today || to.getTime() <= from.getTime()) return null;

  const dayMs = 86_400_000;
  const totalDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / dayMs));
  const elapsed = Math.round((today.getTime() - from.getTime()) / dayMs);
  const daysCompleted = Math.min(totalDays, Math.max(0, elapsed));
  const daysRemaining = Math.max(0, Math.round((to.getTime() - today.getTime()) / dayMs));
  const progress = Math.min(1, Math.max(0, daysCompleted / totalDays));

  return {
    totalDays,
    daysCompleted,
    daysRemaining,
    progress,
    startLabel: formatDate(start),
    endLabel: formatDate(end),
  };
}

function dayLabel(count: number, singular = "day", plural = "days") {
  return `${count} ${count === 1 ? singular : plural}`;
}

function NavyLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "dashboard-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function StudentPortal() {
  const [loading, setLoading] = useState(true);
  const [membershipLabel, setMembershipLabel] = useState("—");
  const [membershipStatus, setMembershipStatus] = useState("Loading…");
  const [membershipStart, setMembershipStart] = useState<string | null>(null);
  const [membershipEnd, setMembershipEnd] = useState<string | null>(null);
  const [planCount, setPlanCount] = useState<number | null>(null);
  const [webinarCount, setWebinarCount] = useState<number | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [nextWebinar, setNextWebinar] = useState<WebinarSummary | null>(null);

  useEffect(() => {
    async function loadSummary() {
      setLoading(true);
      try {
        const [membershipRes, ordersRes, webinarsRes, plansRes] = await Promise.all([
          getCurrentMembership(),
          listOrders({ page: 1, limit: 4 }),
          listWebinars({ page: 1, limit: 8 }).catch(() => null),
          listPlans().catch(() => null),
        ]);

        if (membershipRes.membership) {
          setMembershipLabel(planLabels[membershipRes.membership.plan_type]);
          setMembershipStatus(membershipRes.membership.status);
          setMembershipStart(membershipRes.membership.start_date);
          setMembershipEnd(membershipRes.membership.end_date);
        } else {
          setMembershipLabel("No plan");
          setMembershipStatus("Inactive");
          setMembershipStart(null);
          setMembershipEnd(null);
        }

        setRecentOrders(ordersRes.items);
        setPlanCount(plansRes?.items.length ?? null);
        setWebinarCount(webinarsRes?.pagination.total ?? webinarsRes?.items.length ?? null);

        const now = Date.now();
        const upcoming = (webinarsRes?.items ?? [])
          .filter((item) => {
            const start = new Date(item.starts_at).getTime();
            if (!Number.isFinite(start) || start < now) return false;
            return item.status !== "cancelled" && item.status !== "completed";
          })
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
        setNextWebinar(upcoming[0] ?? null);
      } catch {
        setMembershipStatus("Could not load");
      } finally {
        setLoading(false);
      }
    }

    void loadSummary();
  }, []);

  const badges = {
    plans: planCount,
    webinars: webinarCount,
  };

  return (
    <DashboardPageLayout>
      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
            <NextWebinarCard webinar={nextWebinar} />
            <MembershipRingCard
              planLabel={membershipLabel}
              status={membershipStatus}
              startDate={membershipStart}
              endDate={membershipEnd}
            />
            <QuickToolsCard />
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
            <QuickLinksCard badges={badges} />
            <ActivityCard orders={recentOrders} />
          </div>
        </>
      )}
    </DashboardPageLayout>
  );
}

function NextWebinarCard({ webinar }: { webinar: WebinarSummary | null }) {
  return (
    <section className="dashboard-glass-card relative overflow-hidden rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
          Next webinar
        </p>
        <Link
          href="/student/webinars"
          className="text-brand-caption shrink-0 font-medium text-[color:var(--dash-muted)] hover:text-[color:var(--dash-text)]"
        >
          View all
        </Link>
      </div>

      {webinar ? (
        <div className="mt-2.5 flex flex-col gap-2.5 min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-3.5">
          <WebinarCoverVisual
            coverUrl={webinar.thumbnail_url}
            title={webinar.title}
            booked={Boolean(webinar.is_booked)}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <h2 className="font-sans truncate text-base font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-lg">
                {webinar.title}
              </h2>
              <p className="text-brand-caption mt-1 text-[color:var(--dash-muted)]">
                {formatWebinarWhen(webinar.starts_at)}
              </p>
              <p className="text-brand-caption mt-0.5 text-[color:var(--dash-faint)]">
                {webinar.price > 0 ? formatMoney(webinar.price, webinar.currency) : "Free"}
                {webinar.is_booked ? " · Booked" : ""}
              </p>
            </div>
            <NavyLink
              href={`/student/webinars/${encodeURIComponent(webinar.webinar_id)}`}
              className="w-full shrink-0 sm:w-auto"
            >
              {webinar.is_booked ? "Open webinar" : "View webinar"}
              <SidebarSvgIcon name="next" size={15} />
            </NavyLink>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-col gap-2.5 min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-3.5">
          <WebinarCoverVisual />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <h2 className="font-sans text-base font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-lg">
                No upcoming webinars
              </h2>
              <p className="text-brand-caption mt-1 text-[color:var(--dash-muted)]">
                New sessions will show up here first.
              </p>
            </div>
            <NavyLink href="/student/webinars" className="w-full shrink-0 sm:w-auto">
              Browse webinars
              <SidebarSvgIcon name="next" size={15} />
            </NavyLink>
          </div>
        </div>
      )}
    </section>
  );
}

function MembershipRing({
  progress,
  planLabel,
  status = "",
  untilLabel,
}: {
  progress: number;
  planLabel: string;
  status?: string;
  untilLabel: string | null;
}) {
  const size = 280;
  const stroke = 26;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const isActive = (status ?? "").toLowerCase() === "active";
  const overlayLen = circumference * ratio;
  const showFullDone = ratio >= 0.995;
  const showOverlay = !showFullDone && overlayLen > 0.5;

  return (
    <div className="membership-progress-ring relative h-[14.5rem] w-[14.5rem] overflow-visible sm:h-[15.25rem] sm:w-[15.25rem] lg:h-[16.25rem] lg:w-[16.25rem]">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-full w-full -rotate-90 overflow-visible"
        aria-hidden
      >
        <circle
          data-seg="left"
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--dash-ring-left)"
          strokeWidth={stroke}
        />
        {showFullDone ? (
          <circle
            data-seg="done"
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--dash-ring-done)"
            strokeWidth={stroke}
          />
        ) : showOverlay ? (
          <circle
            data-seg="done"
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--dash-ring-done)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${overlayLen} ${circumference}`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-[18%] flex flex-col items-center justify-center px-3 text-center">
        <p className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="font-sans text-xl font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-2xl">
            {planLabel}
          </span>
          {status ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-semibold lowercase tracking-[0.04em] text-white",
                isActive ? "bg-[#22c55e]" : "bg-[color:var(--dash-dim)]",
              )}
            >
              {status}
            </span>
          ) : null}
        </p>
        {untilLabel ? (
          <p className="text-brand-caption mt-1.5 text-[color:var(--dash-muted)]">
            Active until {untilLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MembershipEmptyRing() {
  const size = 280;
  const stroke = 26;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="membership-progress-body mt-2">
      <div
        className="membership-progress-ring relative h-[14.5rem] w-[14.5rem] sm:h-[15.25rem] sm:w-[15.25rem] lg:h-[16.25rem] lg:w-[16.25rem]"
        role="img"
        aria-label="No active membership term. Choose a plan to unlock lectures, webinars, and tools."
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full overflow-visible" aria-hidden>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--dash-ring-left)"
            strokeWidth={stroke}
            opacity="0.28"
          />
        </svg>
        <div className="absolute inset-[18%] flex flex-col items-center justify-center gap-2.5 px-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--dash-soft)] text-[color:var(--dash-muted)]">
            <SidebarSvgIcon name="plans" size={26} />
          </span>
          <p className="font-sans text-base font-semibold tracking-[0.01em] text-[color:var(--dash-text)]">
            No plan
          </p>
        </div>
      </div>

      <div className="membership-progress-actions">
        <p className="text-brand-body col-span-2 text-sm text-[color:var(--dash-muted)]">
          Choose a plan to unlock lectures, webinars, and tools.
        </p>
        <Button href="/student/plans" className="dashboard-page-action col-span-2 px-4">
          View Plan
        </Button>
      </div>
    </div>
  );
}

function MembershipRingCard({
  planLabel,
  status,
  startDate,
  endDate,
}: {
  planLabel: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}) {
  const stats = membershipDayStats(startDate, endDate);
  const percentDone = stats ? Math.round(stats.progress * 100) : 0;
  const ariaSummary = stats
    ? `${planLabel} membership is ${status}. ${dayLabel(stats.daysCompleted)} completed, ${dayLabel(stats.daysRemaining)} remaining. Started ${stats.startLabel}, ends ${stats.endLabel}.`
    : `${planLabel} membership is ${status}. No active term dates.`;

  return (
    <section className="dashboard-glass-card membership-progress-card rounded-2xl p-4 sm:p-5">
      <p className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
        Membership
      </p>

      {stats && startDate && endDate ? (
        <div className="membership-progress-body mt-2">
          <div className="mx-auto shrink-0 md:mx-0" role="img" aria-label={ariaSummary}>
            <MembershipRing
              progress={stats.progress}
              planLabel={planLabel}
              status={status}
              untilLabel={stats.endLabel}
            />
          </div>

          <div className="membership-progress-actions">
            <p className="membership-progress-legend-item">
              <span className="membership-legend-swatch membership-legend-swatch--done" aria-hidden />
              <span>Days completed</span>
              <strong>{percentDone}%</strong>
            </p>
            <p className="membership-progress-legend-item">
              <span className="membership-legend-swatch membership-legend-swatch--left" aria-hidden />
              <span>Days left</span>
              <strong>{dayLabel(stats.daysRemaining)}</strong>
            </p>
            <Button href="/student/plans" className="dashboard-page-action px-4">
              View Plan
            </Button>
            <NavyLink href="/student/profile/orders" className="px-4">
              Orders
            </NavyLink>
          </div>
        </div>
      ) : (
        <MembershipEmptyRing />
      )}
    </section>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <span className={cn("dashboard-skeleton-block", className)} aria-hidden />;
}

function DashboardSkeleton() {
  return (
    <>
      <div className="flex min-w-0 flex-col gap-3 sm:gap-4" aria-busy="true" aria-label="Loading dashboard">
        <section className="dashboard-glass-card relative overflow-hidden rounded-2xl px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className="flex items-center justify-between gap-2">
            <SkeletonBlock className="h-3 w-24 max-w-[40%] rounded-full" />
            <SkeletonBlock className="h-3 w-14 rounded-full" />
          </div>
          <div className="mt-2.5 flex min-w-0 flex-col gap-2.5 min-[480px]:flex-row min-[480px]:items-center min-[480px]:gap-3.5">
            <SkeletonBlock className="h-[5.75rem] w-full shrink-0 rounded-xl sm:h-[6.25rem] sm:w-[10.5rem] md:w-[12rem]" />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0 space-y-2">
                <SkeletonBlock className="h-5 w-full max-w-[11rem] rounded-full" />
                <SkeletonBlock className="h-3.5 w-full max-w-[9rem] rounded-full" />
              </div>
              <SkeletonBlock className="h-10 w-full shrink-0 rounded-full sm:w-32" />
            </div>
          </div>
        </section>

        <section className="dashboard-glass-card membership-progress-card min-w-0 rounded-2xl p-4 sm:p-5">
          <SkeletonBlock className="h-5 w-28 max-w-[50%] rounded-full sm:h-6" />
          <div className="membership-progress-body mt-2">
            <div className="mx-auto w-full max-w-[14.5rem] shrink-0 sm:max-w-[15.25rem] lg:max-w-[16.25rem] md:mx-0">
              <SkeletonBlock className="membership-progress-ring aspect-square w-full rounded-full" />
            </div>
            <div className="membership-progress-actions">
              <SkeletonBlock className="h-4 w-full rounded-full" />
              <SkeletonBlock className="h-4 w-full rounded-full" />
              <SkeletonBlock className="h-10 w-full rounded-full" />
              <SkeletonBlock className="h-10 w-full rounded-full" />
            </div>
          </div>
        </section>

        <section className="dashboard-glass-card min-w-0 rounded-2xl p-3.5 sm:p-5">
          <SkeletonBlock className="h-5 w-28 max-w-[50%] rounded-full sm:h-6" />
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 min-[420px]:gap-3 sm:mt-4 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex min-w-0 flex-col items-center gap-2 px-1 py-2">
                <SkeletonBlock className="h-12 w-12 rounded-full" />
                <SkeletonBlock className="h-3 w-14 max-w-full rounded-full" />
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
        <section className="dashboard-glass-card min-w-0 rounded-2xl p-3.5 sm:p-5">
          <SkeletonBlock className="mb-1 h-5 w-24 max-w-[50%] rounded-full sm:h-6" />
          <div className="space-y-0.5">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex h-10 min-h-10 min-w-0 items-center gap-2.5 rounded-xl px-3">
                <SkeletonBlock className="h-5 w-5 shrink-0 rounded-full" />
                <SkeletonBlock className="h-3.5 min-w-0 flex-1 rounded-full" />
                <SkeletonBlock className="h-4 w-4 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-glass-card min-w-0 rounded-2xl p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <SkeletonBlock className="h-5 w-32 max-w-[55%] rounded-full sm:h-6" />
            <SkeletonBlock className="h-3.5 w-14 shrink-0 rounded-full" />
          </div>
          <div className="mt-3.5 grid min-w-0 gap-2.5 sm:mt-4 sm:gap-1">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex h-10 min-h-10 min-w-0 items-center justify-between gap-3 rounded-xl px-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <SkeletonBlock className="h-5 w-5 shrink-0 rounded-full" />
                  <SkeletonBlock className="h-3.5 min-w-0 flex-1 rounded-full" />
                </div>
                <SkeletonBlock className="h-3.5 w-14 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function QuickToolsCard() {
  return (
    <section className="dashboard-glass-card rounded-2xl p-3.5 sm:p-5">
      <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
        Quick tools
      </h2>

      <div className="mt-3.5 grid grid-cols-2 gap-2.5 min-[420px]:gap-3 sm:mt-4 sm:grid-cols-4">
        {QUICK_TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group flex min-h-11 flex-col items-center justify-center gap-2 rounded-xl px-1 py-2"
          >
            <span className="dashboard-tool-icon flex h-12 w-12 items-center justify-center rounded-full">
              <SidebarSvgIcon name={tool.icon} size={18} />
            </span>
            <span className="text-brand-caption text-center text-[color:var(--dash-muted)] transition-colors group-hover:text-[color:var(--dash-text)]">
              {tool.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ActivityCard({ orders }: { orders: Order[] }) {
  return (
    <section className="dashboard-glass-card rounded-2xl p-3.5 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
          Recent Activity
        </h2>
        <Link
          href="/student/profile/orders"
          className="text-brand-caption shrink-0 font-medium text-[color:var(--dash-muted)] hover:text-[color:var(--dash-text)]"
        >
          View all
        </Link>
      </div>

      <div className="mt-3.5 grid min-w-0 gap-2.5 sm:mt-4 sm:gap-1">
        {orders.length === 0 ? (
          <p className="text-brand-body py-6 text-center text-[color:var(--dash-faint)]">No orders yet.</p>
        ) : (
          orders.map((order) => (
            <div
              key={order.order_id}
              className="dashboard-row flex h-10 min-h-10 min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl px-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[color:var(--dash-text)]">
                  <SidebarSvgIcon
                    name={
                      order.item_kind === "webinar" || order.webinar_id
                        ? "webinars"
                        : order.plan_type === "annual"
                          ? "plans"
                          : order.plan_type === "monthly"
                            ? "webinars"
                            : "payment"
                    }
                    size={16}
                  />
                </span>
                <p className="font-sans truncate text-sm font-medium text-[color:var(--dash-text)]">
                  {orderItemLabel(order)}
                </p>
              </div>
              <span className="font-sans shrink-0 text-sm font-semibold text-[color:var(--dash-amount)]">
                +{formatMoney(order.amount, order.currency)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function QuickLinksCard({
  badges,
}: {
  badges: { plans: number | null; webinars: number | null };
}) {
  return (
    <section className="dashboard-glass-card rounded-2xl p-3.5 sm:p-5">
      <h2 className="font-sans mb-1 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
        Shortcuts
      </h2>
      <div className="space-y-0.5">
        {QUICK_LINKS.map((link) => {
          const count = link.badge ? badges[link.badge] : null;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="dashboard-row group flex h-10 min-h-10 items-center gap-2.5 rounded-xl px-3"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[color:var(--dash-text)]">
                <SidebarSvgIcon name={link.icon} size={18} />
              </span>
              <span className="font-sans min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--dash-text)]">
                {link.label}
              </span>
              {count != null ? <span className="dashboard-count-badge">{count}</span> : null}
              <SidebarSvgIcon
                name="next"
                size={16}
                className="shrink-0 text-[color:var(--dash-dim)] group-hover:text-[color:var(--dash-muted)]"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
