import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApplicationShell } from "@/components/careflow/application-shell";
import type { AccessMembership, UserAccess } from "@/lib/access";

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
}

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => () => {},
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: "/admin/dashboard" } }),
}));
vi.mock("@/lib/auth", () => ({ useSignOut: () => async () => {} }));

const membership: AccessMembership = {
  id: "m1",
  clinic_id: "c1",
  role: "OWNER",
  status: "ACTIVE",
  clinic: { id: "c1", name: "c1", display_name: "Sri Sai Clinic", status: "ACTIVE" },
};
const access = (admin: boolean, memberships: AccessMembership[] = []): UserAccess => ({
  userId: "u",
  email: "owner@example.com",
  profile: { id: "u", display_name: "Vignesh", platform_role: admin ? "PLATFORM_ADMIN" : "USER", status: "ACTIVE" },
  memberships,
});

describe("application shell header", () => {
  it("shows an Admin breadcrumb instead of the brand in the admin area", () => {
    render(
      <ApplicationShell role="PLATFORM_ADMIN" access={access(true)} membership={null}>
        <p>content</p>
      </ApplicationShell>,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav).toHaveTextContent("Admin");
    expect(nav).toHaveTextContent("Dashboard");
    expect(screen.queryByText("CAREFLOW")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /workspace/i })).not.toBeInTheDocument();
  });

  it("keeps the brand and page line in clinic workspaces", () => {
    render(
      <ApplicationShell role="OWNER" access={access(false, [membership])} membership={membership}>
        <p>content</p>
      </ApplicationShell>,
    );
    expect(screen.getByText("CAREFLOW")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  });
});
