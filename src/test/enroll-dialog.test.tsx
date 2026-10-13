import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EnrollDialog, type EnrollPlan } from "@/components/careflow/enroll-dialog";

const plan: EnrollPlan = { name: "Single Clinic — AI", flexible: false, trialAvailable: true,
  describe: () => ({ scopeText: "Single clinic", ai: "500 AI credits", features: [], price: "₹2,199", trial: "21-day free trial" }) };
const setup = () => {
  const fns = { onCancel: vi.fn(), onConfirm: vi.fn(), onStartTrial: vi.fn() };
  render(<EnrollDialog plan={plan} busy={null} error={null} {...fns} />);
  return fns;
};

describe("enrollment dialog", () => {
  it("× closes without starting or cancelling anything", () => {
    const f = setup();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(f.onCancel).toHaveBeenCalled();
    expect(f.onConfirm).not.toHaveBeenCalled();
    expect(f.onStartTrial).not.toHaveBeenCalled();
  });
  it("has no Cancel button and keeps the full-plan action", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Cancel", exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Full Plan" })).toBeEnabled();
  });
  it("blocks close, Escape and submission while busy", () => {
    const f = { onCancel: vi.fn(), onConfirm: vi.fn(), onStartTrial: vi.fn() };
    render(<EnrollDialog plan={plan} busy="paid" error={null} {...f} />);
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /Preparing checkout/ }));
    expect(f.onCancel).not.toHaveBeenCalled();
    expect(f.onConfirm).not.toHaveBeenCalled();
  });
  it("trial needs explicit consent", () => {
    const f = setup();
    const start = screen.getByRole("button", { name: "Start Free Trial" });
    expect(start).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(start);
    expect(f.onStartTrial).toHaveBeenCalledWith("SINGLE");
  });
});
