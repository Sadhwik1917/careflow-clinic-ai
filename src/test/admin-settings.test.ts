import { describe, expect, it } from "vitest";
import { passwordSchema, profileSchema } from "@/components/careflow/admin-settings-page";

describe("admin settings validation", () => {
  it("accepts a valid profile and empty phone", () => {
    expect(profileSchema.safeParse({ display_name: " Vignesh ", phone: "" }).success).toBe(true);
    expect(profileSchema.safeParse({ display_name: "Vignesh", phone: "+91 98765 43210" }).success).toBe(true);
  });
  it("rejects short names and bad phones", () => {
    expect(profileSchema.safeParse({ display_name: "V", phone: "" }).success).toBe(false);
    expect(profileSchema.safeParse({ display_name: "Vignesh", phone: "abc" }).success).toBe(false);
  });
  it("requires matching passwords of 8+ characters", () => {
    expect(passwordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "longenough1", confirm: "different1" }).success).toBe(false);
    expect(passwordSchema.safeParse({ password: "longenough1", confirm: "longenough1" }).success).toBe(true);
  });
});
