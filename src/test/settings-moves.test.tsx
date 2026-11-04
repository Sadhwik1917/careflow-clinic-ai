import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InviteMemberDialog } from "@/components/careflow/invite-member-dialog";
import { AiUsageCard } from "@/components/careflow/ai-usage-card";
import { ClinicGmailSettings } from "@/components/careflow/clinic-gmail-settings";
import { Route as ClinicAiRoute } from "@/routes/_authenticated/clinic.ai";
import { supabase } from "@/integrations/supabase/client";

// Ensure window.matchMedia exists in jsdom
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

// Hoisted mocks for server functions
const {
  mockInviteClinicMember,
  mockGetClinicGmailStatus,
  mockInitiateGmailConnection,
  mockDisconnectClinicGmail,
} = vi.hoisted(() => ({
  mockInviteClinicMember: vi.fn(),
  mockGetClinicGmailStatus: vi.fn(),
  mockInitiateGmailConnection: vi.fn(),
  mockDisconnectClinicGmail: vi.fn(),
}));

// Mock tanstack router components
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: () => ({
        handler: (fn: any) => fn,
      }),
    }),
  }),
  useServerFn: (fn: any) => fn,
}));

vi.mock("@/lib/team.functions", () => ({
  inviteClinicMember: mockInviteClinicMember,
}));

vi.mock("@/lib/gmail.functions", () => ({
  getClinicGmailStatusFn: mockGetClinicGmailStatus,
  initiateGmailConnectionFn: mockInitiateGmailConnection,
  disconnectClinicGmailFn: mockDisconnectClinicGmail,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock("@/lib/plan-state", () => ({
  clinicAiQuery: () => ({
    queryKey: ["clinic-ai-mock"],
    queryFn: async () => true,
  }),
}));

// Mock subcomponents of AI Assistant to isolate the page layout test
vi.mock("@/components/careflow/patient-summary", () => ({
  PatientSummary: () => <div data-testid="patient-summary">Patient Summary Section</div>,
}));

vi.mock("@/components/careflow/ai-assistant", () => ({
  AiAssistant: () => <div data-testid="ai-assistant">Interactive AI Assistant Input</div>,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("Move AI Credits and Gmail Connection to Settings", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, href: "http://localhost:3000/clinic/settings" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  describe("Task 1: AI Assistant Page & AI Credit Gauge", () => {
    it("AI Assistant page does NOT render the credit gauge or credit usage card", async () => {
      vi.spyOn(ClinicAiRoute, "useRouteContext").mockReturnValue({
        membership: {
          id: "m1",
          clinic_id: "c1",
          role: "OWNER",
          status: "ACTIVE",
        },
      } as any);

      const PageComponent = ClinicAiRoute.options.component!;
      renderWithClient(<PageComponent />);

      // Wait for plan check query to resolve
      await waitFor(() => {
        expect(screen.getByText("AI assistant")).toBeInTheDocument();
      });

      // Verify AI page elements are rendered
      expect(screen.getByText("Ask questions, draft messages and summarise notes.")).toBeInTheDocument();
      expect(screen.getByTestId("patient-summary")).toBeInTheDocument();
      expect(screen.getByTestId("ai-assistant")).toBeInTheDocument();

      // Verify credit gauge and usage card are completely absent from AI Assistant page
      expect(screen.queryByText(/AI credits this month/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/AI Credits & Usage/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/AI credits used/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
    });

    it("renders AI Credit Usage in Settings with gauge, limits, and reset date", async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          included: true,
          credit_type: "LIMITED",
          limit: 500,
          used: 120,
          period_start: "2026-10-01",
          period_end: "2026-11-01",
        },
        error: null,
      } as any);

      renderWithClient(<AiUsageCard clinicId="c1" />);

      await waitFor(() => {
        expect(screen.getByText("AI Credits & Usage")).toBeInTheDocument();
      });

      expect(screen.getByText("Available")).toBeInTheDocument();
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText("/ 500")).toBeInTheDocument();
      expect(screen.getByText(/380 remaining/i)).toBeInTheDocument();
      expect(screen.getByText(/Resets on/i)).toBeInTheDocument();
      expect(screen.getByLabelText("AI credits used")).toBeInTheDocument();
    });

    it("preserves Max AI information and throttling notices in Settings", async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          included: true,
          credit_type: "UNLIMITED",
          limit: null,
          used: 2500,
          period_start: "2026-10-01",
          period_end: "2026-11-01",
          shared: true,
          throttled: true,
        },
        error: null,
      } as any);

      renderWithClient(<AiUsageCard clinicId="c1" />);

      await waitFor(() => {
        expect(screen.getByText("AI Credits & Usage")).toBeInTheDocument();
      });

      expect(screen.getAllByText("Unlimited").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/shared by all clinics on your plan/i)).toBeInTheDocument();
      expect(screen.getByText(/Response may delay due to over credit usage/i)).toBeInTheDocument();
    });

    it("displays informative upgrade state when AI is not included in current plan", async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          included: false,
        },
        error: null,
      } as any);

      renderWithClient(<AiUsageCard clinicId="c1" />);

      await waitFor(() => {
        expect(screen.getByText("Not included")).toBeInTheDocument();
      });

      expect(screen.getByText(/AI assistant features and credit allocations are not included in your current plan/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View plans" })).toHaveAttribute("href", "/clinic/plans");
    });
  });

  describe("Task 2: Invite Doctor Dialog & Gmail Connection in Settings", () => {
    it("Invite Doctor dialog does NOT contain Gmail setup or authorization alerts", async () => {
      renderWithClient(
        <InviteMemberDialog
          userId="u1"
          clinicId="c1"
          defaultRole="DOCTOR"
          triggerLabel="Invite doctor"
        />
      );

      // Open the dialog
      fireEvent.click(screen.getByRole("button", { name: "Invite doctor" }));

      // Verify invite form inputs are present
      expect(screen.getByText("Invite a team member")).toBeInTheDocument();
      expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Send invitation" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

      // Verify Gmail connection configuration is NOT in the dialog
      expect(screen.queryByText(/Checking clinic Gmail authorization/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Clinic Gmail connection required/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Sending invitations from authorized Gmail/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Connect clinic Gmail/i })).not.toBeInTheDocument();
    });

    it("renders Gmail Connection status in Settings when connected with Reconnect and Disconnect actions", async () => {
      mockGetClinicGmailStatus.mockResolvedValue({
        connected: true,
        senderEmail: "clinic.careflow@gmail.com",
        status: "CONNECTED",
        configured: true,
      });

      renderWithClient(<ClinicGmailSettings clinicId="c1" />);

      await waitFor(() => {
        expect(screen.getByText("Gmail Connection")).toBeInTheDocument();
        expect(screen.getByText("Connected")).toBeInTheDocument();
      });

      expect(screen.getByText("clinic.careflow@gmail.com")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();

      // Test Disconnect action
      mockDisconnectClinicGmail.mockResolvedValueOnce({ ok: true });
      fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

      await waitFor(() => {
        expect(mockDisconnectClinicGmail).toHaveBeenCalledWith({ data: { clinicId: "c1" } });
      });
    });

    it("renders Gmail Connection in Settings when not connected with Connect action", async () => {
      mockGetClinicGmailStatus.mockResolvedValue({
        connected: false,
        status: "NOT_CONNECTED",
        configured: true,
      });

      renderWithClient(<ClinicGmailSettings clinicId="c1" />);

      await waitFor(() => {
        expect(screen.getByText("Gmail Connection")).toBeInTheDocument();
        expect(screen.getByText("Not connected")).toBeInTheDocument();
      });

      expect(screen.getByText("No Gmail Account Linked")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Connect clinic Gmail" })).toBeInTheDocument();

      // Test Connect action
      mockInitiateGmailConnection.mockResolvedValueOnce({
        url: "https://accounts.google.com/o/oauth2/v2/auth?test=1",
      });
      fireEvent.click(screen.getByRole("button", { name: "Connect clinic Gmail" }));

      await waitFor(() => {
        expect(mockInitiateGmailConnection).toHaveBeenCalledWith({
          data: { clinicId: "c1", returnTo: "/clinic/settings" },
        });
      });
    });

    it("renders Gmail Connection in Settings when revoked with Reconnect action", async () => {
      mockGetClinicGmailStatus.mockResolvedValue({
        connected: false,
        senderEmail: "revoked.doctor@gmail.com",
        status: "REVOKED",
        configured: true,
      });

      renderWithClient(<ClinicGmailSettings clinicId="c1" />);

      await waitFor(() => {
        expect(screen.getByText("Gmail Connection")).toBeInTheDocument();
        expect(screen.getByText("Disconnected")).toBeInTheDocument();
      });

      expect(screen.getByText(/revoked\.doctor@gmail\.com/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reconnect Gmail" })).toBeInTheDocument();
    });
  });
});
