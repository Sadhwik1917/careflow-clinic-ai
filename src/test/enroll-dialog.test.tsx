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
  it("Cancel before checkout creates no subscription", () => {
    const f = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(f.onCancel).toHaveBeenCalled();
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
