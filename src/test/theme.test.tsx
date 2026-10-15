import { describe, expect, it } from "vitest";
import { parseTheme, resolveTheme } from "@/lib/theme";
import { initials } from "@/components/careflow/user-menu";

describe("theme preference", () => {
  it("parses only known values", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("neon")).toBe("system");
    expect(parseTheme(null)).toBe("system");
  });
  it("resolves system from the device", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("avatar initials", () => {
  it("builds initials from names and emails", () => {
    expect(initials("Vignesh Kumar")).toBe("VK");
    expect(initials("Vignesh")).toBe("VI");
    expect(initials("careflow@admin.com")).toBe("CA");
    expect(initials("  ")).toBe("?");
  });
});
