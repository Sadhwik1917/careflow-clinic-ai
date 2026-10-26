import { describe, expect, it } from "vitest";
import { markRead, mergeNotification, notificationTarget, timeLabel, unreadCount, type NotificationRow } from "@/lib/notifications";

const n = (id: string, at: string, read = false, type = "VERIFICATION_APPROVED"): NotificationRow =>
  ({ id, type, title: id, message: "", is_read: read, created_at: at, clinic_id: "c", related_entity_type: null });

describe("notifications", () => {
  it("counts unread", () => { expect(unreadCount([n("a", "2026-01-01"), n("b", "2026-01-02", true)])).toBe(1); });
  it("marks one as read only", () => {
    const l = markRead([n("a", "1"), n("b", "2")], "a");
    expect(l.map(x => x.is_read)).toEqual([true, false]);
  });
  it("live merge is newest first and never duplicates (reconnect replay)", () => {
    let l = [n("a", "2026-01-01T00:00:00Z")];
    l = mergeNotification(l, n("b", "2026-01-02T00:00:00Z"));
    l = mergeNotification(l, n("b", "2026-01-02T00:00:00Z"));
    expect(l.map(x => x.id)).toEqual(["b", "a"]);
  });
  it("caps the list", () => {
    let l: NotificationRow[] = [];
    for (let i = 0; i < 30; i++) l = mergeNotification(l, n(`x${i}`, `2026-01-${String(i + 1).padStart(2, "0")}`));
    expect(l).toHaveLength(20);
  });
  it("routes reverification and decision notices to the owner's verification page", () => {
    expect(notificationTarget({ type: "REVERIFICATION_DUE" }, "OWNER")).toBe("/clinic/verification");
    expect(notificationTarget({ type: "REVERIFICATION_REMINDER" }, "OWNER")).toBe("/clinic/verification");
    expect(notificationTarget({ type: "VERIFICATION_SUSPENDED" }, "OWNER")).toBe("/clinic/verification");
    expect(notificationTarget({ type: "TRIAL_EXPIRY_REMINDER" }, "OWNER")).toBe("/clinic/plans");
    expect(notificationTarget({ type: "MEMBER_JOINED" }, "OWNER")).toBe("/clinic/staff");
    expect(notificationTarget({ type: "VERIFICATION_APPROVED" }, "STAFF")).toBeNull();
  });
  it("routes admin submission notices to the clinic's admin pages, admins only", () => {
    expect(notificationTarget({ type: "ADMIN_DOCUMENT_UPDATE_SUBMITTED", clinic_id: "c1" }, "PLATFORM_ADMIN")).toBe("/admin/clinics/c1");
    expect(notificationTarget({ type: "ADMIN_REVERIFICATION_SUBMITTED", clinic_id: "c1" }, "PLATFORM_ADMIN")).toBe("/admin/verifications/c1");
    expect(notificationTarget({ type: "ADMIN_DOCUMENT_UPDATE_SUBMITTED", clinic_id: "c1" }, "OWNER")).toBeNull();
    expect(notificationTarget({ type: "ADMIN_REVERIFICATION_SUBMITTED", clinic_id: null }, "PLATFORM_ADMIN")).toBeNull();
  });
  it("formats time", () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    expect(timeLabel("2026-10-14T11:59:30Z", now)).toBe("Just now");
    expect(timeLabel("2026-10-14T11:30:00Z", now)).toBe("30 min ago");
  });
});
