import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionDetails } from "@/components/careflow/subscription-details";
import { Button } from "@/components/ui/button";
import type { SubscriptionRow } from "@/lib/admin-subscription-rules";

vi.mock("@/lib/admin-subscriptions.functions", () => ({
  getAdminSubscriptions: vi.fn(),
  getAdminSubscriptionHistory: vi.fn(async ({ data }: { data: { kind: string } }) => ({ kind: data.kind, rows: [], count: 0 })),
}));
afterEach(cleanup);
const row: SubscriptionRow = {
  id: "11111111-1111-4111-8111-111111111111", status: "PENDING_PAYMENT", subscription_type: "TRIAL", amount: 2199, currency: "INR", billing_cycle: "MONTHLY",
  start_date: "2026-10-01", renewal_date: null, next_billing_date: null, trial_start_date: "2026-10-01", trial_end_date: "2026-10-22",
  trial_cancelled_at: null, cancelled_at: null, auto_renew: true, clinic_scope: "SINGLE", mandate_status: "PENDING", created_at: "2026-10-01",
  plan: { name: "Test plan" }, links: [], payments: [],
};
function setup() {
  const close = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return <><Button onClick={() => setOpen(true)}>View details</Button>{open && <SubscriptionDetails row={row} onClose={() => { close(); setOpen(false); }} />}</>;
  }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Harness /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  return close;
}
describe("subscription details accessibility", () => {
  it("names the modal, shows actual dates, and exposes no cancellation command", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Subscription details" })).toBeInTheDocument();
    expect(screen.getByText("Awaiting mandate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.getByText("Recorded start (awaiting activation)")).toBeInTheDocument();
  });
  it("closes by Escape without a payment action", async () => {
    const close = setup();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
  it("loads independent real-history queries from accessible tabs", async () => {
    setup();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Payments" }), { button: 0, ctrlKey: false });
    await screen.findByText("No payments recorded");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Trial history" }), { button: 0, ctrlKey: false });
    await screen.findByText("No trial events recorded");
    expect(screen.getByRole("tab", { name: "Trial history" })).toHaveAttribute("aria-selected", "true");
  });
});