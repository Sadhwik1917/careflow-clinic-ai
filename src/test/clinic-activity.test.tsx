import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { mergeClinicActivity } from "@/lib/clinic-activity";
import { toDashboardActivity } from "@/lib/admin-data";
import { ClinicActivityList } from "@/components/careflow/clinic-activity-history";

const ver = [
  { id: "1", event_type: "SUBMITTED", reason: null, to_status: "PENDING_REVIEW" as const, created_at: "2026-01-01T00:00:00Z", actor: { display_name: "Owner" } },
  { id: "2", event_type: "SUSPENDED", reason: "Expired licence", to_status: "APPROVED" as const, created_at: "2026-03-01T00:00:00Z", actor: [{ display_name: "Admin" }] },
];
const audit = [
  { id: "a", action: "CLINIC_SUSPEND", created_at: "2026-03-01T00:00:00Z", metadata: { reason: "Expired licence" }, actor: null },
  { id: "b", action: "TRIAL_ACTIVATED", created_at: "2026-02-01T00:00:00Z", metadata: {}, actor: null },
];

describe("clinic activity", () => {
  it("orders newest first and drops duplicate admin audit rows", () => {
    const r = mergeClinicActivity(ver, audit);
    expect(r.map(x => x.id)).toEqual(["v-2", "a-b", "v-1"]);
  });
  it("keeps actor, reason and resulting status; never invents an actor", () => {
    const [s, t] = mergeClinicActivity(ver, audit);
    expect(s).toMatchObject({ label: "Clinic suspended", actor: "Admin", reason: "Expired licence", result: "Suspended" });
    expect(t?.actor).toBeNull();
  });
  it("renders the empty state", () => {
    render(<ClinicActivityList items={[]} />);
    expect(screen.getByText("No activity recorded")).toBeTruthy();
  });
  it("dashboard rows link only to the recorded clinic", () => {
    const r = toDashboardActivity([{ id: "x", action: "CLINIC_SUSPEND", entity_type: "clinic", created_at: "", clinic: { id: "c1", display_name: "A", clinic_code: "CF-1" } }, { id: "y", action: "SUBSCRIPTION_CANCELLED", entity_type: "s", created_at: "", clinic: null }]);
    expect(r[0]?.clinic?.id).toBe("c1");
    expect(r[1]?.clinic).toBeNull();
  });
});
