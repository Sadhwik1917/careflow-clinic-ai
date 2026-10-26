/** In-app notifications. Rows are created only by trusted database workflows; clients may only read their own and mark them read. */
import type { AppRole } from "@/lib/navigation";

export type NotificationRow = {
  id: string; type: string; title: string; message: string; is_read: boolean; created_at: string;
  clinic_id: string | null; related_entity_type: string | null;
};
export const NOTIFICATION_LIMIT = 20;
export const POLL_MS = 60_000; // fallback refresh while Realtime is disconnected
export const NOTIFICATION_COLUMNS = "id, type, title, message, is_read, created_at, clinic_id, related_entity_type";

export const notificationsKey = (userId: string) => ["notifications", userId] as const;

/** Merge a live insert into the list without duplicates, newest first, capped. */
export function mergeNotification(list: NotificationRow[], row: NotificationRow, limit = NOTIFICATION_LIMIT): NotificationRow[] {
  const rest = list.filter(n => n.id !== row.id);
  return [row, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}
export const unreadCount = (list: NotificationRow[]) => list.filter(n => !n.is_read).length;
export const markRead = (list: NotificationRow[], id: string) => list.map(n => (n.id === id ? { ...n, is_read: true } : n));

/** Where a notification leads. Only existing pages; clinic notices go to the owner's verification page. */
export function notificationTarget(n: Pick<NotificationRow, "type"> & { clinic_id?: string | null }, role: AppRole): string | null {
  if (role === "PLATFORM_ADMIN" && n.clinic_id) {
    if (n.type === "ADMIN_DOCUMENT_UPDATE_SUBMITTED") return `/admin/clinics/${n.clinic_id}`;
    if (n.type === "ADMIN_REVERIFICATION_SUBMITTED") return `/admin/verifications/${n.clinic_id}`;
  }
  if (role === "OWNER" && (n.type.startsWith("VERIFICATION_") || n.type.startsWith("REVERIFICATION_"))) return "/clinic/verification";
  if (role === "OWNER" && n.type.startsWith("TRIAL_")) return "/clinic/plans";
  if (role === "OWNER" && n.type === "MEMBER_JOINED") return "/clinic/staff";
  return null;
}

export function timeLabel(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
