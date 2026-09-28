"use client";

import { Button } from "@/components/ui/Button";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { formatMoney } from "@/lib/integrate/provider/student/payment/types";
import type { WebinarSummary } from "@/lib/integrate/provider/student/webinars/types";
import { formatWebinarWhen } from "@/lib/integrate/provider/student/webinars/types";

type WebinarListPanelProps = {
  webinars: WebinarSummary[];
};

function isBooked(webinar: WebinarSummary) {
  return Boolean(webinar.is_booked);
}

function isSoldOut(webinar: WebinarSummary) {
  return !webinar.is_booked && webinar.seats_remaining <= 0;
}

function statusLabel(webinar: WebinarSummary) {
  if (isBooked(webinar)) return "Booked";
  if (isSoldOut(webinar)) return "Full";
  return "Open";
}

function priceLabel(webinar: WebinarSummary) {
  return webinar.price > 0 ? formatMoney(webinar.price, webinar.currency) : "Free";
}

export function WebinarListPanel({ webinars }: WebinarListPanelProps) {
  if (webinars.length === 0) {
    return (
      <section className="dashboard-glass-card flex flex-col items-center rounded-2xl px-5 py-12 text-center sm:py-14">
        <span className="dashboard-tool-icon flex h-14 w-14 items-center justify-center rounded-full text-[color:var(--dash-text)]">
          <SidebarSvgIcon name="webinars" size={22} strokeWidth={1.85} />
        </span>
        <p className="font-sans mt-4 text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
          No published webinars yet
        </p>
        <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
          New live sessions will show up here when they are scheduled.
        </p>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
      {webinars.map((webinar) => (
        <article
          key={webinar.webinar_id}
          className="dashboard-glass-card flex min-w-0 flex-col overflow-hidden rounded-2xl"
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-[color:var(--dash-soft)]">
            {webinar.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={webinar.thumbnail_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center">
                <SidebarSvgIcon name="webinars" size={22} strokeWidth={1.85} />
                <p className="text-brand-caption font-semibold text-[color:var(--dash-faint)]">
                  Cover coming soon
                </p>
              </div>
            )}
            <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-brand-caption font-semibold capitalize text-white">
              {statusLabel(webinar)}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            <div className="min-w-0">
              <h2 className="font-sans line-clamp-2 text-base font-bold tracking-[0.01em] text-[color:var(--dash-text)]">
                {webinar.title}
              </h2>
              <p className="mt-1 font-sans text-sm text-[color:var(--dash-muted)]">
                <span className="font-medium text-[color:var(--dash-faint)]">Time</span>{" "}
                {formatWebinarWhen(webinar.starts_at)}
              </p>
              <p className="text-brand-caption mt-1 text-[color:var(--dash-faint)]">
                {priceLabel(webinar)}
                {" · "}
                {webinar.seats_taken}/{webinar.capacity} booked
              </p>
            </div>

            <div className="mt-auto flex min-w-0 flex-wrap gap-2">
              {isBooked(webinar) && webinar.join_url ? (
                <a
                  href={webinar.join_url}
                  target="_blank"
                  rel="noreferrer"
                  className="webinar-status-btn lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 flex-1 items-center justify-center rounded-full px-4 text-sm font-medium text-white"
                >
                  Join
                </a>
              ) : (
                <span className="webinar-status-btn lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 flex-1 items-center justify-center rounded-full px-4 text-sm font-medium text-white">
                  {isBooked(webinar) ? "Booked" : isSoldOut(webinar) ? "Full" : "Open"}
                </span>
              )}
              <Button
                href={`/student/webinars/${encodeURIComponent(webinar.webinar_id)}`}
                className="lecture-page-action flex-1 px-4"
              >
                View
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
