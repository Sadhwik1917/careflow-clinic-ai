import { describe, expect, it, vi } from "vitest";
import { toast } from "@/lib/toast";

vi.mock("sileo", () => {
  return {
    sileo: {
      success: vi.fn(opts => `mock-success-${opts.title}`),
      error: vi.fn(opts => `mock-error-${opts.title}`),
      warning: vi.fn(opts => `mock-warning-${opts.title}`),
      info: vi.fn(opts => `mock-info-${opts.title}`),
      action: vi.fn(opts => `mock-action-${opts.title}`),
      promise: vi.fn(async (p, opts) => {
        try {
          const res = await p;
          if (typeof opts.success === "function") opts.success(res);
          return res;
        } catch (err) {
          if (typeof opts.error === "function") opts.error(err);
          throw err;
        }
      }),
      dismiss: vi.fn(),
      clear: vi.fn(),
    },
    Toaster: () => null,
  };
});

describe("toast helper", () => {
  it("formats string inputs with default title or content", () => {
    const id = toast.success("Invitation sent successfully");
    expect(id).toBe("mock-success-Success");
  });

  it("handles object options with title and description", () => {
    const id = toast.error({ title: "Save failed", description: "Network connection lost" });
    expect(id).toBe("mock-error-Save failed");
  });

  it("handles warning and info toasts", () => {
    expect(toast.warning("Invitation expires soon")).toBe("mock-warning-Warning");
    expect(toast.info("Verification email sent")).toBe("mock-info-Information");
  });

  it("handles promise toasts on resolution", async () => {
    const fn = vi.fn().mockResolvedValue("done");
    const result = await toast.promise(fn(), {
      loading: "Saving profile…",
      success: "Profile saved successfully",
      error: "Could not save profile",
    });
    expect(result).toBe("done");
  });

  it("handles promise toasts on rejection", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Failed"));
    await expect(
      toast.promise(fn(), {
        loading: "Saving…",
        success: "Saved",
        error: "Save error",
      })
    ).rejects.toThrow("Failed");
  });
});
