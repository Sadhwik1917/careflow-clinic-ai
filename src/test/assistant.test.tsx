import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { checkFile, assistantErrorMessage, ASSISTANT_MODELS } from "@/lib/assistant";
import AILoadingState from "@/components/kokonutui/ai-loading";
import AITextLoading from "@/components/kokonutui/ai-text-loading";

describe("assistant attachments", () => {
  it("accepts supported images and text files within limits", () => {
    expect(checkFile({ name: "a.png", type: "image/png", size: 1000 })).toEqual({ ok: true, kind: "image" });
    expect(checkFile({ name: "notes.md", type: "", size: 1000 })).toEqual({ ok: true, kind: "text" });
  });
  it("refuses unsupported or oversized files", () => {
    expect(checkFile({ name: "x.pdf", type: "application/pdf", size: 10 }).ok).toBe(false);
    expect(checkFile({ name: "a.png", type: "image/png", size: 6 * 1024 * 1024 }).ok).toBe(false);
    expect(checkFile({ name: "a.txt", type: "text/plain", size: 300 * 1024 }).ok).toBe(false);
  });
});

describe("assistant config", () => {
  it("offers only the two server-defined models", () => {
    expect(Object.keys(ASSISTANT_MODELS)).toEqual(["Fast", "Smart"]);
  });
  it("maps server errors to plain messages without leaking internals", () => {
    expect(assistantErrorMessage(new Error("AI_LIMIT_REACHED"))).toMatch(/used all its AI credits/);
    expect(assistantErrorMessage(new Error("something raw"))).toBe("The assistant couldn't reply. Please try again.");
  });
});

describe("kokonut components", () => {
  it("renders the real steps passed in", () => {
    render(<AILoadingState steps={[{ id: "plan", label: "Checking your plan", status: "done" }, { id: "reply", label: "Writing the reply", status: "running" }]} />);
    expect(screen.getAllByText((_, el) => el?.textContent === "Writing the reply").length).toBeGreaterThan(0);
  });
  it("announces the text loader", () => {
    render(<AITextLoading label="Assistant is replying" texts={["Thinking..."]} />);
    expect(screen.getByText("Assistant is replying")).toBeTruthy();
  });
});
