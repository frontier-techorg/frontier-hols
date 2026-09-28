import { apiRequest, getApiBaseUrl } from "@/lib/integrate/client";
import type { AdminPaginationMeta } from "@/lib/integrate/provider/admin/users/types";

export type AppNotification = {
  notification_id: string;
  action: string;
  title: string;
  body: string;
  href?: string | null;
  read: boolean;
  summary?: boolean;
  created_at?: string | null;
  read_at?: string | null;
};

export type NotificationList = {
  items: AppNotification[];
  unread_count: number;
  pagination: AdminPaginationMeta;
};

export type NotificationWsEvent = {
  type: "hello" | "notification" | "read" | "read_all" | "error";
  item?: AppNotification;
  items?: AppNotification[];
  notification_id?: string;
  unread_count?: number;
  message?: string;
};

export function listNotifications(params: { page?: number; limit?: number; unread?: boolean } = {}) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.unread) search.set("unread", "true");
  const query = search.toString();
  return apiRequest<NotificationList>(`/api/notifications${query ? `?${query}` : ""}`, {
    auth: true,
  });
}

export function markNotificationRead(notificationId: string) {
  return apiRequest<{ item: AppNotification; unread_count: number }>(
    `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "POST", auth: true },
  );
}

export function markAllNotificationsRead() {
  return apiRequest<{ unread_count: number; marked: number }>("/api/notifications/read-all", {
    method: "POST",
    auth: true,
  });
}

export function notificationWebsocketUrl(token: string) {
  const http = getApiBaseUrl();
  const ws = http.replace(/^http/i, "ws");
  return `${ws}/api/notifications/stream?token=${encodeURIComponent(token)}`;
}

export const ADMIN_STATS_CHANGED_EVENT = "hols-admin-stats-changed";

export const ADMIN_STATS_ACTIONS = new Set([
  "admin.student_joined",
  "admin.affiliate_created",
  "admin.order_placed",
]);

export function notifyAdminStatsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ADMIN_STATS_CHANGED_EVENT));
}

export const NOTIFICATIONS_CHANGED_EVENT = "hols-notifications-changed";

export function notifyNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function formatNotificationWhen(iso?: string | null, nowMs?: number | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const stamp = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  if (nowMs == null) return stamp;
  const diff = nowMs - date.getTime();
  if (diff < 45_000) return "Just now";
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}h ago`;
  return stamp;
}
