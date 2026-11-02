import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  listPatientInvoices,
  listPatientPayments,
} from "@/lib/clinical.server";
import { PatientBillsView } from "@/components/careflow/patient-bills-view";
import { PatientInvoiceReceiptDialog } from "@/components/careflow/patient-invoice-receipt-dialog";
import type { InvoiceWithDetails } from "@/lib/clinical";

afterEach(cleanup);

// Mock Link from @tanstack/react-router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router"
  );
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

const clinicAId = "11111111-1111-4111-8111-111111111111";
const clinicBId = "22222222-2222-4222-8222-222222222222";
const patientUserId = "33333333-3333-4333-8333-333333333333";
const otherUserId = "44444444-4444-4444-8444-444444444444";
const patientRecordAId = "55555555-5555-4555-8555-555555555555";
const patientRecordBId = "66666666-6666-4666-8666-666666666666";
const otherPatientRecordId = "77777777-7777-4777-8777-777777777777";

function createMockBillingDb(options: {
  patientRecords?: any[];
  invoices?: any[];
  invoiceItems?: any[];
  payments?: any[];
} = {}) {
  const db: any = {
    from: vi.fn((table: string) => {
      if (table === "patients") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((field: string, val: string) => {
              const res = {
                eq: vi.fn((f2: string, v2: string) => {
                  const filtered = (options.patientRecords ?? [
                    { id: patientRecordAId, clinic_id: clinicAId, user_id: patientUserId },
                    { id: patientRecordBId, clinic_id: clinicBId, user_id: patientUserId },
                  ]).filter((p) => p[field] === val && p[f2] === v2);
                  return Promise.resolve({ data: filtered, error: null });
                }),
                then: (resolve: any) => {
                  const filtered = (options.patientRecords ?? [
                    { id: patientRecordAId, clinic_id: clinicAId, user_id: patientUserId },
                    { id: patientRecordBId, clinic_id: clinicBId, user_id: patientUserId },
                  ]).filter((p) => p[field] === val);
                  return resolve({ data: filtered, error: null });
                },
              };
              return res;
            }),
          })),
        };
      }

      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((field: string, ids: string[]) => ({
              order: vi.fn(() => {
                const chain: any = {
                  eq: vi.fn((f2: string, v2: string) => {
                    const filtered = (options.invoices ?? []).filter(
                      (i) => ids.includes(i[field]) && i[f2] === v2
                    );
                    return Promise.resolve({ data: filtered, error: null });
                  }),
                  then: (resolve: any) => {
                    const filtered = (options.invoices ?? []).filter((i) =>
                      ids.includes(i[field])
                    );
                    return resolve({ data: filtered, error: null });
                  },
                };
                return chain;
              }),
            })),
          })),
        };
      }

      if (table === "invoice_items") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((field: string, ids: string[]) => {
              const filtered = (options.invoiceItems ?? []).filter((it) =>
                ids.includes(it[field])
              );
              return Promise.resolve({ data: filtered, error: null });
            }),
          })),
        };
      }

      if (table === "payments") {
        return {
          select: vi.fn(() => ({
            in: vi.fn((field: string, ids: string[]) => {
              const chain: any = {
                order: vi.fn(() => {
                  const subChain: any = {
                    eq: vi.fn((f2: string, v2: string) => {
                      const filtered = (options.payments ?? []).filter(
                        (p) => ids.includes(p[field]) && p[f2] === v2
                      );
                      return Promise.resolve({ data: filtered, error: null });
                    }),
                    then: (resolve: any) => {
                      const filtered = (options.payments ?? []).filter((p) =>
                        ids.includes(p[field])
                      );
                      return resolve({ data: filtered, error: null });
                    },
                  };
                  return subChain;
                }),
              };
              return chain;
            }),
          })),
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      };
    }),
  };

  return db;
}

describe("Patient Billing — Server Ownership & Clinic Isolation", () => {
  it("retrieves only invoices belonging to caller's linked patient records", async () => {
    const db = createMockBillingDb({
      patientRecords: [
        { id: patientRecordAId, clinic_id: clinicAId, user_id: patientUserId },
      ],
      invoices: [
        {
          id: "inv-patient-a",
          clinic_id: clinicAId,
          patient_id: patientRecordAId,
          invoice_number: "INV-2026-001",
          status: "ISSUED",
          total_amount: 1500,
          amount_paid: 500,
          amount_due: 1000,
          issued_at: "2026-10-28T09:30:00Z",
          clinic: { id: clinicAId, name: "CareFlow Clinic A" },
        },
        {
          id: "inv-other-patient",
          clinic_id: clinicAId,
          patient_id: otherPatientRecordId, // other patient!
          invoice_number: "INV-2026-999",
          status: "PAID",
          total_amount: 3000,
          amount_paid: 3000,
          amount_due: 0,
        },
      ],
    });

    const invoices = await listPatientInvoices(db, patientUserId);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.id).toBe("inv-patient-a");
    expect(invoices[0]!.patient_id).toBe(patientRecordAId);
    expect(invoices[0]!.invoice_number).toBe("INV-2026-001");
    expect(invoices[0]!.total_amount).toBe(1500);
    expect(invoices[0]!.amount_due).toBe(1000);
  });

  it("returns empty array when user has no linked patient profiles", async () => {
    const db = createMockBillingDb({ patientRecords: [] });
    const invoices = await listPatientInvoices(db, otherUserId);
    expect(invoices).toEqual([]);
  });

  it("enforces clinic isolation when clinicId filter is supplied", async () => {
    const db = createMockBillingDb({
      patientRecords: [
        { id: patientRecordAId, clinic_id: clinicAId, user_id: patientUserId },
        { id: patientRecordBId, clinic_id: clinicBId, user_id: patientUserId },
      ],
      invoices: [
        {
          id: "inv-clinic-a",
          clinic_id: clinicAId,
          patient_id: patientRecordAId,
          invoice_number: "INV-A-101",
          total_amount: 800,
          amount_paid: 800,
          amount_due: 0,
          status: "PAID",
        },
        {
          id: "inv-clinic-b",
          clinic_id: clinicBId,
          patient_id: patientRecordBId,
          invoice_number: "INV-B-202",
          total_amount: 1200,
          amount_paid: 0,
          amount_due: 1200,
          status: "ISSUED",
        },
      ],
    });

    // Request scoped only to Clinic A
    const clinicAInvoices = await listPatientInvoices(db, patientUserId, clinicAId);
    expect(clinicAInvoices).toHaveLength(1);
    expect(clinicAInvoices[0]!.id).toBe("inv-clinic-a");
    expect(clinicAInvoices[0]!.clinic_id).toBe(clinicAId);

    // Request scoped only to Clinic B
    const clinicBInvoices = await listPatientInvoices(db, patientUserId, clinicBId);
    expect(clinicBInvoices).toHaveLength(1);
    expect(clinicBInvoices[0]!.id).toBe("inv-clinic-b");
    expect(clinicBInvoices[0]!.clinic_id).toBe(clinicBId);
  });

  it("attaches itemized line items and payments to caller's invoices", async () => {
    const db = createMockBillingDb({
      patientRecords: [
        { id: patientRecordAId, clinic_id: clinicAId, user_id: patientUserId },
      ],
      invoices: [
        {
          id: "inv-detailed",
          clinic_id: clinicAId,
          patient_id: patientRecordAId,
          invoice_number: "INV-DET-001",
          status: "PARTIALLY_PAID",
          subtotal: 1000,
          discount: 100,
          tax: 0,
          total_amount: 900,
          amount_paid: 400,
          amount_due: 500,
          issued_at: "2026-10-29T10:00:00Z",
          clinic: { id: clinicAId, name: "CareFlow Central Hospital" },
        },
      ],
      invoiceItems: [
        {
          id: "item-1",
          invoice_id: "inv-detailed",
          description: "Doctor Consultation",
          quantity: 1,
          unit_price: 500,
          total: 500,
        },
        {
          id: "item-2",
          invoice_id: "inv-detailed",
          description: "Rx: Amoxicillin 500mg",
          quantity: 2,
          unit_price: 250,
          total: 500,
        },
      ],
      payments: [
        {
          id: "pay-1",
          clinic_id: clinicAId,
          invoice_id: "inv-detailed",
          patient_id: patientRecordAId,
          amount: 400,
          payment_method: "UPI",
          transaction_reference: "UPI/2026/001",
          status: "SUCCESS",
          paid_at: "2026-10-29T10:15:00Z",
        },
      ],
    });

    const [inv] = await listPatientInvoices(db, patientUserId);
    expect(inv).toBeDefined();
    expect(inv!.items).toHaveLength(2);
    expect(inv!.items[0]!.description).toBe("Doctor Consultation");
    expect(inv!.items[1]!.description).toBe("Rx: Amoxicillin 500mg");
    expect(inv!.payments).toHaveLength(1);
    expect(inv!.payments[0]!.amount).toBe(400);
    expect(inv!.payments[0]!.payment_method).toBe("UPI");
    expect(inv!.payments[0]!.transaction_reference).toBe("UPI/2026/001");
  });

  it("retrieves patient payments accurately with clinic isolation", async () => {
    const db = createMockBillingDb({
      patientRecords: [
        { id: patientRecordAId, clinic_id: clinicAId, user_id: patientUserId },
      ],
      payments: [
        {
          id: "pay-patient-a",
          clinic_id: clinicAId,
          patient_id: patientRecordAId,
          amount: 500,
          payment_method: "CARD",
          transaction_reference: "CARD-REF-999",
          status: "SUCCESS",
          paid_at: "2026-10-29T11:00:00Z",
          clinic: { id: clinicAId, name: "CareFlow Clinic A" },
          invoice: { id: "inv-1", invoice_number: "INV-101", total_amount: 500, amount_paid: 500, amount_due: 0, status: "PAID" },
        },
        {
          id: "pay-other",
          clinic_id: clinicAId,
          patient_id: otherPatientRecordId,
          amount: 2000,
          payment_method: "CASH",
          status: "SUCCESS",
        },
      ],
    });

    const payments = await listPatientPayments(db, patientUserId);
    expect(payments).toHaveLength(1);
    expect(payments[0]!.id).toBe("pay-patient-a");
    expect(payments[0]!.amount).toBe(500);
    expect(payments[0]!.payment_method).toBe("CARD");
    expect(payments[0]!.transaction_reference).toBe("CARD-REF-999");
    expect(payments[0]!.invoice?.invoice_number).toBe("INV-101");
  });
});

describe("Patient Bills View & Printable Receipt (Frontend UI)", () => {
  let qc: QueryClient;

  const mockInvoices: InvoiceWithDetails[] = [
    {
      id: "inv-101",
      clinic_id: clinicAId,
      patient_id: patientRecordAId,
      appointment_id: null,
      invoice_number: "INV-2026-0001",
      subtotal: 1000,
      discount: 100,
      tax: 0,
      total_amount: 900,
      amount_paid: 900,
      amount_due: 0,
      status: "PAID",
      issued_at: "2026-10-25T10:00:00Z",
      created_by: null,
      created_at: "2026-10-25T09:45:00Z",
      updated_at: "2026-10-25T10:05:00Z",
      clinic: {
        id: clinicAId,
        name: "CareFlow Prime Clinic",
        address: "123 Medical Center Way",
        phone: "+91 98765 43210",
      },
      patient: {
        id: patientRecordAId,
        patient_number: "P-1001",
        first_name: "Aarav",
        last_name: "Sharma",
        phone: "+91 98765 00000",
      },
      items: [
        {
          id: "item-1",
          invoice_id: "inv-101",
          description: "Consultation - Dr. Specialist",
          quantity: 1,
          unit_price: 600,
          total: 600,
          created_at: "2026-10-25T10:00:00Z",
        },
        {
          id: "item-2",
          invoice_id: "inv-101",
          description: "Rx: Paracetamol 650mg",
          quantity: 2,
          unit_price: 200,
          total: 400,
          created_at: "2026-10-25T10:00:00Z",
        },
      ],
      payments: [
        {
          id: "pay-1",
          clinic_id: clinicAId,
          patient_id: patientRecordAId,
          invoice_id: "inv-101",
          amount: 900,
          payment_method: "UPI",
          transaction_reference: "UPI/TXN/998877",
          status: "SUCCESS",
          paid_at: "2026-10-25T10:05:00Z",
          recorded_by: null,
          created_at: "2026-10-25T10:05:00Z",
        },
      ],
    },
    {
      id: "inv-102",
      clinic_id: clinicAId,
      patient_id: patientRecordAId,
      appointment_id: null,
      invoice_number: "INV-2026-0002",
      subtotal: 500,
      discount: 0,
      tax: 0,
      total_amount: 500,
      amount_paid: 0,
      amount_due: 500,
      status: "ISSUED",
      issued_at: "2026-10-29T14:00:00Z",
      created_by: null,
      created_at: "2026-10-29T13:50:00Z",
      updated_at: "2026-10-29T14:00:00Z",
      clinic: {
        id: clinicAId,
        name: "CareFlow Prime Clinic",
        address: "123 Medical Center Way",
        phone: "+91 98765 43210",
      },
      patient: {
        id: patientRecordAId,
        patient_number: "P-1001",
        first_name: "Aarav",
        last_name: "Sharma",
        phone: "+91 98765 00000",
      },
      items: [
        {
          id: "item-3",
          invoice_id: "inv-102",
          description: "Follow-up Consultation",
          quantity: 1,
          unit_price: 500,
          total: 500,
          created_at: "2026-10-29T14:00:00Z",
        },
      ],
      payments: [],
    },
  ];

  const mockPayments = [
    {
      id: "pay-1",
      clinic_id: clinicAId,
      patient_id: patientRecordAId,
      invoice_id: "inv-101",
      amount: 900,
      payment_method: "UPI" as const,
      transaction_reference: "UPI/TXN/998877",
      status: "SUCCESS" as const,
      paid_at: "2026-10-25T10:05:00Z",
      recorded_by: null,
      created_at: "2026-10-25T10:05:00Z",
      clinic: { id: clinicAId, name: "CareFlow Prime Clinic", phone: "+91 98765 43210", address: null },
      invoice: {
        id: "inv-101",
        invoice_number: "INV-2026-0001",
        total_amount: 900,
        amount_paid: 900,
        amount_due: 0,
        status: "PAID" as const,
        issued_at: "2026-10-25T10:00:00Z",
      },
    },
  ];

  beforeEach(() => {
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();
  });

  it("renders page title, summary metrics, and tab controls", () => {
    qc.setQueryData(["patient-invoices", clinicAId], mockInvoices);
    qc.setQueryData(["patient-payments", clinicAId], mockPayments);

    render(
      <QueryClientProvider client={qc}>
        <PatientBillsView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    expect(screen.getByText("Bills & payment receipts")).toBeDefined();
    expect(screen.getByText("Total invoiced")).toBeDefined();
    expect(screen.getByText("Total settled")).toBeDefined();
    expect(screen.getByText("Outstanding balance")).toBeDefined();
    expect(screen.getByRole("tab", { name: /Invoices & Bills/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Payment History/i })).toBeDefined();
  });

  it("renders empty state when patient has no invoices on record", () => {
    qc.setQueryData(["patient-invoices", clinicAId], []);
    qc.setQueryData(["patient-payments", clinicAId], []);

    render(
      <QueryClientProvider client={qc}>
        <PatientBillsView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    expect(screen.getByText("No bills on record")).toBeDefined();
  });

  it("renders real invoice details including invoice number, clinic, amount, and payment status", () => {
    qc.setQueryData(["patient-invoices", clinicAId], mockInvoices);
    qc.setQueryData(["patient-payments", clinicAId], mockPayments);

    render(
      <QueryClientProvider client={qc}>
        <PatientBillsView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    // Invoices are rendered with their numbers
    expect(screen.getByText("#INV-2026-0001")).toBeDefined();
    expect(screen.getByText("#INV-2026-0002")).toBeDefined();

    // Clinic name is displayed
    const clinicElements = screen.getAllByText("CareFlow Prime Clinic");
    expect(clinicElements.length).toBeGreaterThan(0);

    // Status badges
    expect(screen.getByText("PAID")).toBeDefined();
    expect(screen.getByText("ISSUED")).toBeDefined();

    // Outstanding notice for unpaid invoice
    expect(screen.getByText(/Outstanding Balance: ₹500/i)).toBeDefined();
    expect(screen.getByText(/Please settle this balance at the clinic reception/i)).toBeDefined();
  });

  it("switches to Payment History tab and displays verified transaction records", async () => {
    qc.setQueryData(["patient-invoices", clinicAId], mockInvoices);
    qc.setQueryData(["patient-payments", clinicAId], mockPayments);

    render(
      <QueryClientProvider client={qc}>
        <PatientBillsView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    const paymentsTab = screen.getByRole("tab", { name: /Payment History/i });
    fireEvent.mouseDown(paymentsTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(screen.getByText("UPI/TXN/998877")).toBeDefined();
      expect(screen.getByText("UPI")).toBeDefined();
      expect(screen.getByText("SUCCESS")).toBeDefined();
    });
  });

  it("opens Itemized Bill Breakdown dialog and displays charges and payments", async () => {
    qc.setQueryData(["patient-invoices", clinicAId], mockInvoices);
    qc.setQueryData(["patient-payments", clinicAId], mockPayments);

    render(
      <QueryClientProvider client={qc}>
        <PatientBillsView clinicId={clinicAId} />
      </QueryClientProvider>
    );

    const viewBreakdownBtns = screen.getAllByRole("button", { name: /View Breakdown/i });
    fireEvent.click(viewBreakdownBtns[0]!);

    await waitFor(() => {
      expect(screen.getByText("Invoice Breakdown #INV-2026-0001")).toBeDefined();
      expect(screen.getByText("Consultation - Dr. Specialist")).toBeDefined();
      expect(screen.getByText("Rx: Paracetamol 650mg")).toBeDefined();
      expect(screen.getByText("Total Amount")).toBeDefined();
    });
  });

  it("opens Official Receipt modal with printable view and triggers print", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    render(
      <QueryClientProvider client={qc}>
        <PatientInvoiceReceiptDialog
          open={true}
          onOpenChange={vi.fn()}
          invoice={mockInvoices[0]!}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText("Official Invoice & Payment Receipt")).toBeDefined();
    expect(screen.getByText("PAID IN FULL")).toBeDefined();
    expect(screen.getByText("Aarav Sharma")).toBeDefined();
    expect(screen.getByText("#INV-2026-0001")).toBeDefined();
    expect(screen.getByText("CareFlow Prime Clinic")).toBeDefined();

    // Trigger Print
    const printBtn = screen.getByRole("button", { name: /Print \/ Save PDF/i });
    fireEvent.click(printBtn);
    expect(printSpy).toHaveBeenCalled();

    printSpy.mockRestore();
  });
});
