"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readStoredPortalTheme } from "@/components/platform/provider/portal-theme-store";
import { useUnreadNotificationsCount } from "@/components/platform/provider/notifications/NotificationsLiveSync";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import {
  formatNotificationWhen,
  getUnreadNotificationsCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_CHANGED_EVENT,
  setUnreadNotificationsCount,
  type AppNotification,
  type NotificationList,
} from "@/lib/integrate/provider/notifications";
import { cn } from "@/lib/utils";

type PanelPosition = {
  top: number;
  right: number;
  left?: number;
  maxHeight?: number;
  sheet?: boolean;
};

const PAGE_SIZE = 20;
const PANEL_MAX_HEIGHT = 440;

function pageHasMore(page: number, received: number, data: NotificationList) {
  if (received === 0) return false;
  const total = Math.max(data.pagination?.total || 0, data.unread_count || 0);
  if (total > page * PAGE_SIZE) return true;
  if (data.pagination?.has_next) return true;
  return received === PAGE_SIZE && total === 0;
}

function NotifyBellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden
      className="notify-bell-icon shrink-0"
    >
      <path
        fill="currentColor"
        d="M12 2.55a1.25 1.25 0 0 1 1.25 1.25v.42a6.15 6.15 0 0 1 4.95 6.02v1.95c0 .78.3 1.53.84 2.08l.18.18c.46.48.12 1.28-.55 1.28H5.33c-.67 0-1.01-.8-.55-1.28l.18-.18a2.95 2.95 0 0 0 .84-2.08V10.24a6.15 6.15 0 0 1 4.95-6.02v-.42A1.25 1.25 0 0 1 12 2.55Z"
      />
      <path
        fill="currentColor"
        d="M9.05 17.3a2.95 2.95 0 0 0 5.9 0c0-.38-.3-.68-.68-.68H9.73c-.38 0-.68.3-.68.68Z"
      />
    </svg>
  );
}

export function NotificationsBell({
  buttonClassName,
}: {
  buttonClassName?: string;
} = {}) {
  const titleId = useId();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(1);
  const hasNextRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<PanelPosition>({ top: 0, right: 16, sheet: false });
  const [items, setItems] = useState<AppNotification[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const unreadCount = useUnreadNotificationsCount();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listNotifications({ page: 1, limit: PAGE_SIZE });
      const received = data.items.length;
      const more = pageHasMore(1, received, data);
      pageRef.current = 1;
      hasNextRef.current = more;
      setItems(data.items);
      setHasNext(more);
      setUnreadNotificationsCount(data.unread_count || 0);
    } catch {
      pageRef.current = 1;
      hasNextRef.current = false;
      setItems([]);
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasNextRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const data = await listNotifications({ page: nextPage, limit: PAGE_SIZE });
      const incoming = data.items;
      if (incoming.length === 0) {
        hasNextRef.current = false;
        setHasNext(false);
        return;
      }
      setItems((current) => {
        const seen = new Set(current.map((item) => item.notification_id));
        return [...current, ...incoming.filter((item) => !seen.has(item.notification_id))];
      });
      const more = pageHasMore(nextPage, incoming.length, data);
      pageRef.current = nextPage;
      hasNextRef.current = more;
      setHasNext(more);
      setUnreadNotificationsCount(data.unread_count || 0);
    } catch {
      /* keep the current list */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sheet = vw < 480;
    const preferred = rect.bottom + 8;
    const minTop = margin;
    const maxTop = Math.max(minTop, vh - margin - 180);
    const top = Math.min(Math.max(preferred, minTop), maxTop);
    const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(280, vh - top - margin));

    if (sheet) {
      setPosition({ top, right: margin, left: margin, maxHeight, sheet: true });
      return;
    }

    const width = Math.min(360, vw - margin * 2);
    let right = Math.max(margin, vw - rect.right);
    if (right + width > vw - margin) {
      right = Math.max(margin, vw - margin - width);
    }
    setPosition({ top, right, left: undefined, maxHeight, sheet: false });
  }, []);

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    void load();
  }, [load]);

  useEffect(() => {
    function refresh() {
      void load();
    }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", updatePosition);
    const onWindowScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      updatePosition();
    };
    window.addEventListener("scroll", onWindowScroll, true);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onWindowScroll, true);
    };
  }, [open, updatePosition]);

  const markOne = async (item: AppNotification) => {
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
  };

  const markAll = async () => {
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadNotificationsCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      void load();
    }
  };

  const unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);
  const theme = mounted ? readStoredPortalTheme() : "light";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={
          mounted && unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          buttonClassName ??
            "dashboard-notify-btn relative flex h-10 w-10 items-center justify-center rounded-full sm:h-12 sm:w-12",
        )}
      >
        <NotifyBellIcon />
        {mounted && unreadCount > 0 ? <span className="dashboard-notify-badge">{unreadLabel}</span> : null}
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              data-theme={theme}
              data-lenis-prevent
              className={cn(
                "dashboard-popover dashboard-notify-panel",
                position.sheet && "dashboard-notify-panel--sheet",
              )}
              style={{
                top: position.top,
                right: position.right,
                left: position.left,
                maxHeight: position.maxHeight,
              }}
            >
              <div className="dashboard-notify-panel-header">
                <h2 id={titleId} className="font-sans min-w-0 text-sm font-semibold tracking-[0.01em]">
                  Notifications
                </h2>
                <div className="flex min-w-0 shrink-0 items-center gap-1">
                  <p className="dashboard-notify-faint text-brand-caption">
                    {loading ? "Updating…" : unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                  </p>
                  {position.sheet ? (
                    <button
                      type="button"
                      aria-label="Close notifications"
                      onClick={() => setOpen(false)}
                      className="adviser-onboarding-close inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    >
                      <SidebarSvgIcon name="cross" size={22} strokeWidth={2.2} />
                    </button>
                  ) : null}
                </div>
              </div>

              <NotificationList
                items={items}
                loading={loading}
                loadingMore={loadingMore}
                hasNext={hasNext}
                nowMs={nowMs}
                onLoadMore={loadMore}
                onOpen={async (item) => {
                  await markOne(item);
                  setOpen(false);
                }}
              />

              <div className="dashboard-notify-panel-footer">
                <button
                  type="button"
                  onClick={() => void markAll()}
                  disabled={unreadCount === 0}
                  className="font-sans inline-flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 text-xs font-semibold transition hover:bg-[var(--notify-soft)] disabled:cursor-default disabled:opacity-50"
                >
                  Mark all read
                </button>
                {hasNext ? (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loading || loadingMore}
                    className="dashboard-navy-btn font-sans inline-flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg px-3 text-xs font-semibold text-white disabled:cursor-default disabled:opacity-50"
                  >
                    {loadingMore ? "Loading…" : "View more"}
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function NotificationList({
  items,
  loading,
  loadingMore,
  hasNext,
  nowMs,
  onLoadMore,
  onOpen,
}: {
  items: AppNotification[];
  loading: boolean;
  loadingMore: boolean;
  hasNext: boolean;
  nowMs?: number | null;
  onLoadMore: () => void;
  onOpen: (item: AppNotification) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const maybeLoadMore = useCallback(() => {
    const list = listRef.current;
    if (!list || !hasNext || loadingMore) return;
    if (list.scrollTop < 12) return;
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remaining <= 48) onLoadMore();
  }, [hasNext, loadingMore, onLoadMore]);

  useEffect(() => {
    const list = listRef.current;
    const sentinel = sentinelRef.current;
    if (!list || !sentinel || !hasNext || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (list.scrollTop < 12) return;
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { root: list, rootMargin: "0px", threshold: 0.01 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, loading, loadingMore, items.length, onLoadMore]);

  if (loading && items.length === 0) {
    return (
      <div className="dashboard-notify-list py-1" aria-busy="true" aria-label="Loading notifications">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex gap-3 px-3.5 py-2.5">
            <span className="dashboard-skeleton-block mt-1.5 h-2 w-2 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <span className="dashboard-skeleton-block h-3.5 w-[78%] rounded-full" />
              <span className="dashboard-skeleton-block h-3 w-[52%] rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-5 text-center">
        <p className="font-sans text-sm font-semibold">No notifications yet</p>
        <p className="dashboard-notify-faint text-brand-caption mt-1">New activity will show up here.</p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="dashboard-notify-list"
      data-lenis-prevent
      onScroll={maybeLoadMore}
    >
      {items.map((item) => {
        const href = item.href || "#";
        const inner = (
          <>
            <span
              className={cn("dashboard-notify-dot", item.read && "dashboard-notify-dot--read")}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="font-sans block text-[0.8125rem] font-semibold leading-snug break-words">
                {item.title}
              </span>
              {item.body ? (
                <span className="dashboard-notify-meta mt-0.5 text-brand-caption">
                  {item.body}
                </span>
              ) : null}
              {item.created_at ? (
                <span className="dashboard-notify-faint mt-1 block text-[0.65rem] leading-none">
                  {formatNotificationWhen(item.created_at, nowMs)}
                </span>
              ) : null}
            </span>
          </>
        );

        if (item.href) {
          return (
            <Link
              key={item.notification_id}
              href={href}
              onClick={() => onOpen(item)}
              className={cn("dashboard-notify-item", !item.read && "dashboard-notify-item--unread")}
            >
              {inner}
            </Link>
          );
        }

        return (
          <button
            key={item.notification_id}
            type="button"
            onClick={() => onOpen(item)}
            className={cn("dashboard-notify-item w-full text-left", !item.read && "dashboard-notify-item--unread")}
          >
            {inner}
          </button>
        );
      })}
      {hasNext || loadingMore ? <div ref={sentinelRef} className="h-1 w-full shrink-0" aria-hidden /> : null}
      {loadingMore ? (
        <div className="flex min-h-[3.65rem] items-center justify-center px-3" aria-live="polite">
          <p className="dashboard-notify-faint text-brand-caption">Loading more…</p>
        </div>
      ) : null}
    </div>
  );
}
