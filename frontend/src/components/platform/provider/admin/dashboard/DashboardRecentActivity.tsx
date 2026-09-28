"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import {
  formatNotificationWhen,
  getUnreadNotificationsCount,
  listNotifications,
  markNotificationRead,
  NOTIFICATIONS_CHANGED_EVENT,
  setUnreadNotificationsCount,
  type AppNotification,
} from "@/lib/integrate/provider/notifications";
import { cn } from "@/lib/utils";

const PREVIEW_LIMIT = 6;

export function DashboardRecentActivity({ className }: { className?: string }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listNotifications({ page: 1, limit: PREVIEW_LIMIT });
      setItems(data.items);
      setUnreadNotificationsCount(data.unread_count || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
    void load();
  }, [load]);

  useEffect(() => {
    function refresh() {
      void load();
    }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  async function openItem(item: AppNotification) {
    if (item.read) return;
    setItems((current) =>
      current.map((row) => (row.notification_id === item.notification_id ? { ...row, read: true } : row)),
    );
    setUnreadNotificationsCount(Math.max(0, getUnreadNotificationsCount() - 1));
    try {
      const result = await markNotificationRead(item.notification_id);
      setUnreadNotificationsCount(result.unread_count);
    } catch {
      void load();
    }
  }

  const busy = loading && items.length === 0;

  return (
    <section className={cn("dashboard-glass-card min-w-0 overflow-hidden rounded-2xl", className)}>
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3.5 sm:px-5 sm:pt-5">
        <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
          Recent activity
        </h2>
      </div>

      {busy ? (
        <div className="space-y-2 px-4 pb-5 sm:px-5" aria-busy="true" aria-label="Loading recent activity">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className="dashboard-skeleton-block block h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 pb-6">
          <p className="font-sans text-sm font-semibold text-[color:var(--dash-text)]">No activity yet</p>
          <p className="text-brand-caption mt-1 text-[color:var(--dash-muted)]">
            New students, affiliates, and orders will show up here.
          </p>
        </div>
      ) : (
        <ul className="mt-3.5 grid min-w-0 gap-1 px-3.5 pb-3.5 sm:mt-4 sm:px-5 sm:pb-5">
          {items.map((item) => {
            const when = formatNotificationWhen(item.created_at, nowMs);
            const inner = (
              <>
                <span
                  className={cn("dashboard-notify-dot mt-1.5", item.read && "dashboard-notify-dot--read")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <span className="font-sans min-w-0 text-sm font-semibold leading-snug text-[color:var(--dash-text)] [overflow-wrap:anywhere] sm:truncate">
                      {item.title}
                    </span>
                    {when ? (
                      <span className="text-brand-caption shrink-0 text-[color:var(--dash-faint)]">{when}</span>
                    ) : null}
                  </span>
                  <span className="text-brand-caption mt-1 block line-clamp-2 text-[color:var(--dash-muted)]">
                    {item.body}
                  </span>
                </span>
                {item.href ? (
                  <SidebarSvgIcon name="next" size={16} className="mt-1 shrink-0 text-[color:var(--dash-faint)]" />
                ) : null}
              </>
            );
            const className = cn(
              "notify-inbox-item flex w-full min-w-0 items-start gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--sidebar-hover)] sm:gap-3",
              !item.read && "notify-inbox-item--unread",
            );

            if (item.href) {
              return (
                <li key={item.notification_id}>
                  <Link href={item.href} onClick={() => void openItem(item)} className={className}>
                    {inner}
                  </Link>
                </li>
              );
            }

            return (
              <li key={item.notification_id}>
                <button type="button" onClick={() => void openItem(item)} className={className}>
                  {inner}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
