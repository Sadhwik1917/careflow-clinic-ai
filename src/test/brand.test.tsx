import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CareflowBrand } from "@/components/careflow/brand";
vi.mock("@tanstack/react-router", () => ({ Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a> }));
describe("clinic header brand", () => {
  it("shows trimmed real names and updates when clinic changes", () => {
    const { rerender } = render(<CareflowBrand clinicName="  First Clinic  " ownerProfileLink />);
    expect(screen.getByTitle("First Clinic")).toHaveTextContent("First Clinic");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(<CareflowBrand clinicName="Second Clinic" ownerProfileLink />);
    expect(screen.queryByTitle("First Clinic")).not.toBeInTheDocument();
    expect(screen.getByTitle("Second Clinic")).toBeInTheDocument();
  });
  it("links owners directly to dashboard for blank or missing names only", () => {
    const { rerender } = render(<CareflowBrand clinicName="  " ownerProfileLink />);
    expect(screen.getByRole("link", { name: "Complete Clinic Profile" })).toHaveAttribute("href", "/clinic/dashboard");
    rerender(<CareflowBrand clinicName={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("CAREFLOW")).toBeInTheDocument();
  });
  it("keeps the full long name available", () => {
    const name = "A very long clinic display name that remains accessible in full";
    render(<CareflowBrand clinicName={name} />);
    expect(screen.getByTitle(name)).toHaveClass("truncate");
  });
});