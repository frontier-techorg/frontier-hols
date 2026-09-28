"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { SkeletonBlock } from "@/components/platform/provider/student/DashboardSkeletons";
import { ApiRequestError } from "@/lib/integrate/client";
import { formatMoney } from "@/lib/integrate/provider/student/payment/types";
import {
  bookWebinar,
  getWebinar,
  type WebinarSummary,
} from "@/lib/integrate/provider/student/webinars/api";
import { formatWebinarWhen } from "@/lib/integrate/provider/student/webinars/types";
import { cn } from "@/lib/utils";

type WebinarDetailPanelProps = {
  webinarId: string;
  compact?: boolean;
  onWebinarChange?: (webinar: WebinarSummary) => void;
};

export function WebinarDetailPanel({
  webinarId,
  compact = false,
  onWebinarChange,
}: WebinarDetailPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [webinar, setWebinar] = useState<WebinarSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWebinar(webinarId);
      setWebinar(data.webinar);
      onWebinarChange?.(data.webinar);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load webinar.");
    } finally {
      setLoading(false);
    }
  }, [webinarId]);

  useEffect(() => {
    setLoading(true);
    setWebinar(null);
    setError(null);
    setSuccess(null);
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function handleBook() {
    setBooking(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await bookWebinar(webinarId);
      setWebinar(data.webinar);
      onWebinarChange?.(data.webinar);
      setSuccess(
        data.webinar.price > 0
          ? "Seat booked and payment recorded."
          : "Seat booked successfully.",
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not book this webinar.");
    } finally {
      setBooking(false);
    }
  }

  if (loading || (webinar != null && webinar.webinar_id !== webinarId)) {
    return <WebinarDetailSkeleton compact={compact} />;
  }

  if (!webinar) {
    return (
      <section className="dashboard-glass-card flex flex-col items-center px-5 py-12 text-center sm:py-14">
        <span className="dashboard-tool-icon flex h-12 w-12 items-center justify-center rounded-full text-[color:var(--dash-text)]">
          <SidebarSvgIcon name="webinars" size={22} strokeWidth={1.85} />
        </span>
        <p className="font-sans mt-4 text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
          Webinar unavailable
        </p>
        <p className="mt-1.5 max-w-sm font-sans text-sm font-normal leading-6 text-[color:var(--dash-muted)]">
          This session could not be loaded. Go back to the list and try another webinar.
        </p>
        {error ? (
          <div className="mt-4 w-full max-w-sm text-left">
            <AuthAlert variant="error">{error}</AuthAlert>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="grid min-w-0 gap-3 sm:gap-4">
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
      {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

      <div className={cn("grid min-w-0 items-stretch gap-3 sm:gap-4", !compact && "lg:grid-cols-2")}>
        <section className={cn("dashboard-glass-card flex h-full min-w-0 flex-col overflow-hidden rounded-2xl p-4", !compact && "sm:p-5 md:p-6")}>
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-[color:var(--dash-soft)]">
          {webinar.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={webinar.thumbnail_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="dashboard-tool-icon flex h-12 w-12 items-center justify-center rounded-full text-[color:var(--dash-text)]">
                <SidebarSvgIcon name="webinars" size={20} strokeWidth={1.85} />
              </span>
              <p className="text-brand-caption font-semibold text-[color:var(--dash-faint)]">
                Cover coming soon
              </p>
            </div>
          )}
        </div>
        <p className="mt-3 font-sans text-sm text-[color:var(--dash-muted)]">
          <span className="font-medium text-[color:var(--dash-faint)]">Time</span>{" "}
          {formatWebinarWhen(webinar.starts_at)}
        </p>
        {webinar.description ? (
          <p className="mt-2 max-w-3xl break-words font-sans text-sm font-normal leading-6 text-[color:var(--dash-muted)]">
            {webinar.description}
          </p>
        ) : (
          <p className="mt-2 break-words font-sans text-sm font-normal leading-6 text-[color:var(--dash-faint)]">
            Details for this live session will be shared closer to the start time.
          </p>
        )}
      </section>

      <aside className="dashboard-glass-card flex h-full min-w-0 flex-col rounded-2xl p-4 sm:p-5 md:p-6">
        <p className="text-brand-caption font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]">
          Booking
        </p>

        <div className="mt-4 grid gap-2.5">
          <BookingStat
            icon="payment"
            label="Price"
            value={webinar.price > 0 ? formatMoney(webinar.price, webinar.currency) : "Free"}
          />
          <BookingStat icon="users" label="Seats left" value={String(webinar.seats_remaining)} />
          <BookingStat
            icon={webinar.is_booked ? "check" : "webinars"}
            label="Status"
            value={webinar.is_booked ? "Booked" : webinar.seats_remaining <= 0 ? "Full" : "Open"}
          />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {webinar.is_booked ? (
            webinar.join_url ? (
              <a
                href={webinar.join_url}
                target="_blank"
                rel="noreferrer"
                className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium tracking-[0.01em] text-white"
              >
                Join live
                <SidebarSvgIcon name="next" size={14} strokeWidth={2} />
              </a>
            ) : (
              <span className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 min-h-10 w-full items-center justify-center rounded-full px-4 text-sm font-medium text-[color:var(--dash-text)]">
                Join link coming soon
              </span>
            )
          ) : (
            <Button
              type="button"
              disabled={booking || webinar.seats_remaining <= 0}
              onClick={() => {
                if (webinar.price > 0) {
                  router.push(
                    `/student/plans/checkout?webinar=${encodeURIComponent(webinar.webinar_id)}`,
                  );
                  return;
                }
                void handleBook();
              }}
              className="lecture-page-action w-full"
            >
              <SidebarSvgIcon name="check" size={15} strokeWidth={2.2} />
              {booking
                ? "Booking…"
                : webinar.seats_remaining <= 0
                  ? "Sold out"
                  : webinar.price > 0
                    ? `Pay ${formatMoney(webinar.price, webinar.currency)} & book`
                    : "Book free seat"}
            </Button>
          )}

        </div>

        {webinar.price > 0 && !webinar.is_booked ? (
          <p className="text-brand-caption mt-4 text-[color:var(--dash-faint)]">
            Paid seats go through checkout before the booking is saved.
          </p>
        ) : null}
        </aside>
      </div>
    </div>
  );
}

function WebinarDetailSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn("grid min-w-0 items-stretch gap-3 sm:gap-4", !compact && "lg:grid-cols-2")}
      aria-busy="true"
      aria-label="Loading webinar"
    >
      <section
        className={cn(
          "dashboard-glass-card flex h-full min-w-0 flex-col overflow-hidden rounded-2xl p-4",
          !compact && "sm:p-5 md:p-6",
        )}
      >
        <SkeletonBlock className="aspect-[16/9] w-full rounded-2xl" />
        <SkeletonBlock className="mt-3 h-4 w-40 max-w-full rounded-full" />
        <div className="mt-2 min-w-0 space-y-2">
          <SkeletonBlock className="h-3.5 w-full rounded-full" />
          <SkeletonBlock className="h-3.5 w-[92%] max-w-full rounded-full" />
          <SkeletonBlock className="h-3.5 w-[68%] max-w-full rounded-full" />
        </div>
      </section>

      <aside className="dashboard-glass-card flex h-full min-w-0 flex-col rounded-2xl p-4 sm:p-5 md:p-6">
        <SkeletonBlock className="h-3 w-16 rounded-full" />
        <div className="mt-4 grid min-w-0 gap-2.5">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-[color:var(--dash-surface-border)] px-3.5 py-2.5"
            >
              <SkeletonBlock className="h-9 w-9 shrink-0 rounded-[0.7rem]" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <SkeletonBlock className="h-3.5 w-16 max-w-full rounded-full" />
                <SkeletonBlock className="h-3.5 w-24 max-w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <SkeletonBlock className="mt-4 h-10 w-full rounded-full" />
      </aside>
    </div>
  );
}

function BookingStat({
  icon,
  label,
  value,
}: {
  icon: "payment" | "users" | "check" | "webinars";
  label: string;
  value: string;
}) {
  return (
    <div className="webinar-booking-stat flex items-center gap-3 rounded-2xl border px-3.5 py-2.5">
      <span className="webinar-booking-icon">
        <SidebarSvgIcon name={icon} size={18} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-sm font-normal leading-5 text-[color:var(--dash-muted)]">{label}</p>
        <p className="font-sans truncate text-sm font-semibold leading-5 text-[color:var(--dash-text)]">{value}</p>
      </div>
    </div>
  );
}
