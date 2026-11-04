import { describe, it, expect, vi } from "vitest";
import {
  roundCurrency,
  formatINR,
  calculateLineItem,
  calculateInvoiceTotals,
} from "@/lib/billing-calculations";
import {
  saveOrCompleteDoctorConsultation,
  updateInvoiceBilling,
  recordInvoicePayment,
  createDirectInvoice,
} from "@/lib/clinical.server";

// Test UUIDs
const clinicId = "11111111-1111-1111-1111-111111111111";
const userId = "22222222-2222-2222-2222-222222222222";
const staffUserId = "33333333-3333-3333-3333-333333333333";
const doctorId = "44444444-4444-4444-4444-444444444444";
const patientId = "55555555-5555-5555-5555-555555555555";
const appointmentId = "66666666-6666-6666-6666-666666666666";
const consultationId = "77777777-7777-7777-7777-777777777777";
const prescriptionId = "88888888-8888-8888-8888-888888888888";
const invoiceId = "99999999-9999-9999-9999-999999999999";

function createMockBillingDb(options: {
  role?: "OWNER" | "STAFF" | "DOCTOR" | "PATIENT";
  invoiceStatus?: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  invoiceSubtotal?: number;
  invoiceDiscount?: number;
  invoiceTotalAmount?: number;
  invoiceAmountPaid?: number;
  invoiceAmountDue?: number;
  existingInvoice?: boolean;
  doctorConsultationFee?: number | null;
  items?: Array<{ id: string; description: string; quantity: number; unit_price: number; total: number }>;
} = {}) {
  const role = options.role ?? "STAFF";

  const invoiceRow = {
    id: invoiceId,
    clinic_id: clinicId,
    patient_id: patientId,
    appointment_id: appointmentId,
    invoice_number: "INV-20261029-TEST",
    status: options.invoiceStatus ?? "DRAFT",
    subtotal: options.invoiceSubtotal ?? 500,
    tax: 0,
    discount: options.invoiceDiscount ?? 0,
    total_amount: options.invoiceTotalAmount ?? 500,
    amount_paid: options.invoiceAmountPaid ?? 0,
    amount_due: options.invoiceAmountDue ?? 500,
    issued_at: options.invoiceStatus === "ISSUED" ? "2026-10-29T10:00:00Z" : null,
    created_by: userId,
    created_at: "2026-10-29T09:00:00Z",
    updated_at: "2026-10-29T09:00:00Z",
  };

  const currentItems = options.items ?? [
    {
      id: "item-consultation",
      invoice_id: invoiceId,
      description: "Doctor Consultation Fee",
      quantity: 1,
      unit_price: 500,
      total: 500,
      created_at: "2026-10-29T09:00:00Z",
    },
    {
      id: "item-med-1",
      invoice_id: invoiceId,
      description: "Rx: Amoxicillin 500mg",
      quantity: 1,
      unit_price: 0, // Unpriced draft
      total: 0,
      created_at: "2026-10-29T09:00:00Z",
    },
  ];

  const calls: [string, unknown[]][] = [];
  const insertedRows: Record<string, any[]> = {};
  const updatedRows: Record<string, any[]> = {};

  const from = (table: string) => {
    let pendingInsert: any = null;
    let pendingUpdate: any = null;
    const filters: Record<string, any> = {};

    const chain: any = {};
    for (const m of ["select", "insert", "update", "delete", "order", "eq", "neq", "in", "limit"]) {
      chain[m] = (...args: any[]) => {
        calls.push([`${table}.${m}`, args]);
        if (m === "eq") {
          filters[args[0]] = args[1];
        }
        if (m === "insert") {
          pendingInsert = args[0];
          if (!insertedRows[table]) insertedRows[table] = [];
          if (Array.isArray(args[0])) {
            insertedRows[table].push(...args[0]);
          } else {
            insertedRows[table].push(args[0]);
          }
        }
        if (m === "update") {
          pendingUpdate = args[0];
          if (!updatedRows[table]) updatedRows[table] = [];
          updatedRows[table].push(args[0]);
        }
        return chain;
      };
    }

    chain.single = async () => {
      if (table === "appointments") {
        return {
          data: {
            id: appointmentId,
            clinic_id: clinicId,
            patient_id: patientId,
            doctor_profile_id: doctorId,
            scheduled_start: "2026-10-29T10:00:00Z",
            scheduled_end: "2026-10-29T10:30:00Z",
            status: "IN_CONSULTATION",
          },
          error: null,
        };
      }
      if (table === "invoices") {
        return {
          data: {
            ...invoiceRow,
            ...(pendingInsert ?? {}),
            ...(pendingUpdate ?? {}),
            patient: {
              id: patientId,
              patient_number: "P-1001",
              first_name: "Anita",
              last_name: "Sharma",
              phone: "9876543210",
            },
            appointment: {
              id: appointmentId,
              scheduled_start: "2026-10-29T10:00:00Z",
              scheduled_end: "2026-10-29T10:30:00Z",
              appointment_type: "IN_PERSON",
            },
          },
          error: null,
        };
      }
      if (table === "patients") {
        return {
          data: {
            id: patientId,
            clinic_id: clinicId,
            patient_number: "P-1001",
            first_name: "Anita",
            last_name: "Sharma",
            phone: "9876543210",
          },
          error: null,
        };
      }
      return { data: pendingInsert ?? {}, error: null };
    };

    chain.maybeSingle = async () => {
      if (table === "profiles") {
        return { data: { platform_role: "USER", status: "ACTIVE" }, error: null };
      }
      if (table === "clinic_members") {
        return { data: { role, status: "ACTIVE" }, error: null };
      }
      if (table === "invoices") {
        return { data: options.existingInvoice ? invoiceRow : null, error: null };
      }
      if (table === "doctor_profiles") {
        return {
          data: {
            id: doctorId,
            user_id: userId,
            clinic_id: clinicId,
            specialization: "General Medicine",
            department: "OPD",
            status: "ACTIVE",
            consultation_fee: options.doctorConsultationFee ?? 650,
          },
          error: null,
        };
      }
      if (table === "consultations") {
        return {
          data: {
            id: consultationId,
            clinic_id: clinicId,
            patient_id: patientId,
            doctor_profile_id: doctorId,
            appointment_id: appointmentId,
            status: "IN_PROGRESS",
          },
          error: null,
        };
      }
      if (table === "prescriptions") {
        return {
          data: {
            id: prescriptionId,
            clinic_id: clinicId,
            patient_id: patientId,
            doctor_profile_id: doctorId,
            consultation_id: consultationId,
            status: "ACTIVE",
          },
          error: null,
        };
      }
      if (table === "queue_entries") {
        if (filters["status"] === "WAITING") {
          return { data: null, error: null };
        }
        return {
          data: {
            id: "queue-1",
            clinic_id: clinicId,
            appointment_id: appointmentId,
            doctor_profile_id: doctorId,
            status: "IN_CONSULTATION",
            queue_number: 1,
            queue_date: "2026-10-29",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    };

    chain.then = (resolve: any) => {
      if (table === "profiles") {
        resolve({ data: [{ id: userId, platform_role: "USER", status: "ACTIVE" }], error: null });
        return;
      }
      if (table === "clinic_members") {
        resolve({
          data: [
            {
              clinic_id: clinicId,
              user_id: userId,
              role,
              status: "ACTIVE",
            },
            {
              clinic_id: clinicId,
              user_id: staffUserId,
              role,
              status: "ACTIVE",
            },
          ],
          error: null,
        });
        return;
      }
      if (table === "invoice_items") {
        resolve({
          data: currentItems,
          error: null,
        });
        return;
      }
      if (table === "payments") {
        resolve({
          data: [],
          error: null,
        });
        return;
      }
      if (table === "doctor_profiles") {
        resolve({
          data: [
            {
              id: doctorId,
              clinic_id: clinicId,
              user_id: userId,
              consultation_fee: options.doctorConsultationFee ?? 650,
            },
          ],
          error: null,
        });
        return;
      }
      resolve({ data: [], error: null });
    };

    return chain;
  };

  const rpc = vi.fn(async (procName: string, args: any) => {
    calls.push([`rpc.${procName}`, [args]]);
    if (procName === "clinic_is_operational") {
      return { data: true, error: null };
    }
    if (procName === "clinic_member_names") {
      return { data: [{ user_id: userId, display_name: "Dr. Doctor" }], error: null };
    }
    if (procName === "record_invoice_payment") {
      if (options.invoiceStatus === "DRAFT") {
        return {
          data: null,
          error: { message: "Invoice has already been finalized or cancelled.", code: "22023" },
        };
      }
      const amt = Number(args.p_amount);
      if (amt > invoiceRow.amount_due) {
        return {
          data: null,
          error: { message: `Payment cannot exceed the outstanding balance of ₹${invoiceRow.amount_due}.`, code: "22023" },
        };
      }
      const newPaid = invoiceRow.amount_paid + amt;
      const newDue = Math.max(0, invoiceRow.total_amount - newPaid);
      return {
        data: {
          payment: {
            id: "pay-1",
            amount: amt,
            payment_method: args.p_payment_method,
            status: "SUCCESS",
            created_at: new Date().toISOString(),
          },
          invoice: {
            ...invoiceRow,
            amount_paid: newPaid,
            amount_due: newDue,
            status: newDue === 0 ? "PAID" : "PARTIALLY_PAID",
          },
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });

  return {
    from,
    rpc,
    calls,
    insertedRows,
    updatedRows,
    invoiceRow,
  } as any;
}

describe("CAREFLOW AI — Medicine Pricing, Calculations & Discounts", () => {
  describe("1. Currency Precision & Financial Calculations", () => {
    it("rounds currency strictly to 2 decimal places and handles float drift", () => {
      expect(roundCurrency(10.555)).toBe(10.56);
      expect(roundCurrency(10.554)).toBe(10.55);
      expect(roundCurrency(0.1 + 0.2)).toBe(0.3); // Avoids 0.30000000000000004
      expect(roundCurrency(19.999)).toBe(20);
      expect(roundCurrency(NaN)).toBe(0);
      expect(roundCurrency(Infinity)).toBe(0);
    });

    it("formats Indian Rupee (INR) amounts consistently", () => {
      expect(formatINR(500)).toBe("₹500");
      expect(formatINR(1250.5)).toBe("₹1,250.50");
      expect(formatINR(100000)).toBe("₹1,00,000");
      expect(formatINR(0)).toBe("₹0");
    });

    it("calculates line item: Gross = Unit Price × Qty, Final = Gross - Discount", () => {
      const line = calculateLineItem({
        description: "Rx: Amoxicillin 500mg",
        quantity: 10,
        unit_price: 15.5,
        discount: 20,
      });

      expect(line.gross_amount).toBe(155); // 15.5 * 10
      expect(line.discount).toBe(20);
      expect(line.total).toBe(135); // 155 - 20
      expect(line.is_missing_price).toBe(false);
    });

    it("prevents line discount from exceeding gross amount (cannot become negative)", () => {
      const line = calculateLineItem({
        description: "Rx: Paracetamol 650mg",
        quantity: 5,
        unit_price: 10,
        discount: 100, // Exceeds gross of ₹50
      });

      expect(line.gross_amount).toBe(50);
      expect(line.discount).toBe(50); // Capped at gross
      expect(line.total).toBe(0); // Not negative
    });

    it("identifies missing prices for medicine items with unit price 0", () => {
      const line = calculateLineItem({
        description: "Rx: Azithromycin 500mg",
        quantity: 3,
        unit_price: 0,
      });

      expect(line.is_missing_price).toBe(true);
      expect(line.total).toBe(0);
    });
  });

  describe("2. Invoice Totals and Discount Handling", () => {
    it("calculates invoice totals with percentage discounts", () => {
      const result = calculateInvoiceTotals({
        items: [
          { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500, discount: 0 },
          { description: "Rx: Medicine A", quantity: 10, unit_price: 25, discount: 0 }, // 250
          { description: "Rx: Medicine B", quantity: 5, unit_price: 50, discount: 0 }, // 250
        ],
        discountType: "PERCENTAGE",
        discountValue: 10, // 10% discount on ₹1,000 subtotal
        amountPaid: 0,
      });

      expect(result.subtotal).toBe(1000);
      expect(result.totalLineDiscounts).toBe(0);
      expect(result.invoiceDiscount).toBe(100);
      expect(result.totalDiscount).toBe(100);
      expect(result.totalAmount).toBe(900);
      expect(result.amountDue).toBe(900);
      expect(result.hasMissingPrices).toBe(false);
    });

    it("validates percentage discount boundaries (0% to 100%)", () => {
      const result100 = calculateInvoiceTotals({
        items: [{ description: "Doctor Consultation", quantity: 1, unit_price: 500 }],
        discountType: "PERCENTAGE",
        discountValue: 100,
      });
      expect(result100.totalAmount).toBe(0);
      expect(result100.totalDiscount).toBe(500);

      // Percentage above 100% is clamped to 100%
      const resultExceed = calculateInvoiceTotals({
        items: [{ description: "Doctor Consultation", quantity: 1, unit_price: 500 }],
        discountType: "PERCENTAGE",
        discountValue: 150,
      });
      expect(resultExceed.totalAmount).toBe(0);
      expect(resultExceed.totalDiscount).toBe(500);
    });

    it("calculates fixed amount discount and prevents it from exceeding eligible subtotal", () => {
      const result = calculateInvoiceTotals({
        items: [
          { description: "Consultation Fee", quantity: 1, unit_price: 500 },
          { description: "Rx: Syrups", quantity: 2, unit_price: 150 }, // 300
        ],
        discountType: "FIXED",
        discountValue: 150, // ₹150 off ₹800
      });

      expect(result.subtotal).toBe(800);
      expect(result.invoiceDiscount).toBe(150);
      expect(result.totalAmount).toBe(650);
      expect(result.amountDue).toBe(650);

      // Excessive fixed discount cannot exceed subtotal
      const capped = calculateInvoiceTotals({
        items: [{ description: "Consultation Fee", quantity: 1, unit_price: 500 }],
        discountType: "FIXED",
        discountValue: 9999,
      });
      expect(capped.totalDiscount).toBe(500);
      expect(capped.totalAmount).toBe(0);
    });

    it("correctly combines line-item discounts with invoice-level discounts", () => {
      const result = calculateInvoiceTotals({
        items: [
          { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500, discount: 0 },
          { description: "Rx: Antibiotics", quantity: 10, unit_price: 50, discount: 50 }, // Gross 500 - 50 = 450
        ],
        discountType: "FIXED",
        discountValue: 50, // Additional ₹50 invoice-level discount
        amountPaid: 200,
      });

      expect(result.subtotal).toBe(1000);
      expect(result.totalLineDiscounts).toBe(50);
      expect(result.invoiceDiscount).toBe(50);
      expect(result.totalDiscount).toBe(100);
      expect(result.totalAmount).toBe(900); // 1000 - 100
      expect(result.amountPaid).toBe(200);
      expect(result.amountDue).toBe(700); // 900 - 200
    });
  });

  describe("3. Clinical Workflow: Removal of Hardcoded ₹100 Default", () => {
    it("creates a DRAFT invoice with unpriced (₹0) medicines when doctor prescribes without prices", async () => {
      const db = createMockBillingDb({
        role: "DOCTOR",
        doctorConsultationFee: 700,
      });

      const res = await saveOrCompleteDoctorConsultation(db, userId, clinicId, {
        clinicId,
        appointmentId,
        assessment: "Acute Pharyngitis",
        medications: [
          {
            medicine_name: "Amoxicillin",
            dosage: "500 mg",
            frequency: "1-0-1",
            // No price specified!
          },
          {
            medicine_name: "Paracetamol",
            dosage: "650 mg",
            frequency: "SOS",
            // No price specified!
          },
        ],
        finalize: true,
      });

      expect(res.invoice).toBeDefined();
      const insertedInvoices = db.insertedRows["invoices"];
      expect(insertedInvoices).toBeDefined();
      const invoice = insertedInvoices[0]!;

      // Notice: Medicine prices do NOT silently default to ₹100!
      // Invoice is created in DRAFT status because medicine prices are pending.
      expect(invoice.status).toBe("DRAFT");
      // Subtotal only reflects the doctor consultation fee of ₹700, NOT ₹700 + ₹200.
      expect(invoice.subtotal).toBe(700);
      expect(invoice.total_amount).toBe(700);

      // Verify invoice items
      const items = db.insertedRows["invoice_items"];
      expect(items).toBeDefined();
      expect(items.length).toBe(3);
      expect(items[0]!.description).toBe("Doctor Consultation Fee");
      expect(items[0]!.unit_price).toBe(700);

      expect(items[1]!.description).toContain("Amoxicillin");
      expect(items[1]!.unit_price).toBe(0); // ₹0, NOT ₹100!
      expect(items[1]!.total).toBe(0);

      expect(items[2]!.description).toContain("Paracetamol");
      expect(items[2]!.unit_price).toBe(0); // ₹0, NOT ₹100!
      expect(items[2]!.total).toBe(0);
    });

    it("creates an ISSUED invoice immediately when explicit medicine prices are supplied", async () => {
      const db = createMockBillingDb({
        role: "DOCTOR",
        doctorConsultationFee: 500,
      });

      const res = await saveOrCompleteDoctorConsultation(db, userId, clinicId, {
        clinicId,
        appointmentId,
        assessment: "Bronchitis",
        medications: [
          {
            medicine_name: "Cough Syrup",
            quantity: 2,
            unit_price: 120, // Explicit price ₹120 each
            frequency: "0-0-1",
          },
        ],
        finalize: true,
      });

      const invoice = db.insertedRows["invoices"]![0]!;
      expect(invoice.status).toBe("ISSUED");
      expect(invoice.subtotal).toBe(740); // 500 fee + 240 syrup
      expect(invoice.total_amount).toBe(740);
      expect(invoice.amount_due).toBe(740);
    });
  });

  describe("4. Authorized Billing User Price Entry & Invoice Editing (`updateInvoiceBilling`)", () => {
    it("allows authorized staff to enter medicine prices and finalize DRAFT invoice", async () => {
      const db = createMockBillingDb({
        role: "STAFF",
        existingInvoice: true,
        invoiceStatus: "DRAFT",
        invoiceSubtotal: 500,
        invoiceTotalAmount: 500,
        invoiceAmountDue: 500,
      });

      const updated = await updateInvoiceBilling(db, staffUserId, clinicId, {
        clinicId,
        invoiceId,
        items: [
          { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500, discount: 0 },
          { description: "Rx: Amoxicillin 500mg", quantity: 10, unit_price: 18, discount: 10 }, // 180 - 10 = 170
          { description: "Rx: Paracetamol 650mg", quantity: 20, unit_price: 4, discount: 0 }, // 80
        ],
        discountType: "FIXED",
        discountValue: 50, // ₹50 invoice discount
        finalize: true,
      });

      // 500 + 180 + 80 = 760 gross
      // 10 line discount + 50 invoice discount = 60 total discount
      // 760 - 60 = 700 net
      expect(updated.subtotal).toBe(760);
      expect(updated.discount).toBe(60);
      expect(updated.total_amount).toBe(700);
      expect(updated.amount_due).toBe(700);
      expect(updated.status).toBe("ISSUED");

      // Verify audit log
      expect(db.insertedRows["audit_logs"]).toBeDefined();
      const audit = db.insertedRows["audit_logs"]![0]!;
      expect(audit.action).toBe("INVOICE_UPDATED");
      expect(audit.metadata.finalized).toBe(true);
    });

    it("rejects finalizing an invoice if any medicine price is missing or zero", async () => {
      const db = createMockBillingDb({
        role: "STAFF",
        existingInvoice: true,
        invoiceStatus: "DRAFT",
      });

      await expect(
        updateInvoiceBilling(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          items: [
            { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500 },
            { description: "Rx: Incomplete Medicine", quantity: 1, unit_price: 0 }, // Missing price!
          ],
          finalize: true,
        })
      ).rejects.toThrow("has a missing or zero price. A valid positive price is required before finalizing");
    });

    it("allows saving draft prices with missing prices when finalize is false", async () => {
      const db = createMockBillingDb({
        role: "STAFF",
        existingInvoice: true,
        invoiceStatus: "DRAFT",
      });

      const draftResult = await updateInvoiceBilling(db, staffUserId, clinicId, {
        clinicId,
        invoiceId,
        items: [
          { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500 },
          { description: "Rx: Unpriced Medicine", quantity: 1, unit_price: 0 },
        ],
        finalize: false, // Save as draft
      });

      expect(draftResult.status).toBe("DRAFT");
    });

    it("validates that unit prices are non-negative and quantities are positive", async () => {
      const db = createMockBillingDb({ role: "STAFF", existingInvoice: true });

      await expect(
        updateInvoiceBilling(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          items: [{ description: "Medicine", quantity: 1, unit_price: -50 }],
          finalize: false,
        })
      ).rejects.toThrow();

      await expect(
        updateInvoiceBilling(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          items: [{ description: "Medicine", quantity: 0, unit_price: 50 }],
          finalize: false,
        })
      ).rejects.toThrow();
    });

    it("preserves historical invoices: rejects modification of PAID or CANCELLED invoices", async () => {
      const dbPaid = createMockBillingDb({
        role: "OWNER",
        existingInvoice: true,
        invoiceStatus: "PAID",
      });

      await expect(
        updateInvoiceBilling(dbPaid, userId, clinicId, {
          clinicId,
          invoiceId,
          items: [{ description: "Consultation", quantity: 1, unit_price: 600 }],
        })
      ).rejects.toThrow("Cannot modify a paid invoice. Historical invoice prices and totals are preserved.");

      const dbCancelled = createMockBillingDb({
        role: "OWNER",
        existingInvoice: true,
        invoiceStatus: "CANCELLED",
      });

      await expect(
        updateInvoiceBilling(dbCancelled, userId, clinicId, {
          clinicId,
          invoiceId,
          items: [{ description: "Consultation", quantity: 1, unit_price: 600 }],
        })
      ).rejects.toThrow("Cannot modify a cancelled invoice.");
    });
  });

  describe("5. Payment Integrity & Status Consistency", () => {
    it("prevents recording payment against a DRAFT unpriced invoice", async () => {
      const db = createMockBillingDb({
        role: "STAFF",
        existingInvoice: true,
        invoiceStatus: "DRAFT",
      });

      await expect(
        recordInvoicePayment(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          amount: 500,
          payment_method: "UPI",
        })
      ).rejects.toThrow("Cannot record payment for a draft invoice. Please enter medicine prices and finalize the bill first.");
    });

    it("records payment on an ISSUED invoice and updates status to PAID when fully settled", async () => {
      const db = createMockBillingDb({
        role: "STAFF",
        existingInvoice: true,
        invoiceStatus: "ISSUED",
        invoiceTotalAmount: 700,
        invoiceAmountDue: 700,
        invoiceAmountPaid: 0,
      });

      const res = await recordInvoicePayment(db, staffUserId, clinicId, {
        clinicId,
        invoiceId,
        amount: 700,
        payment_method: "CASH",
        transaction_reference: "CASH-REC-001",
      });

      expect(res.payment.amount).toBe(700);
      expect(res.invoice.amount_paid).toBe(700);
      expect(res.invoice.amount_due).toBe(0);
      expect(res.invoice.status).toBe("PAID");
    });
  });

  describe("6. Direct Invoice Creation (`createDirectInvoice`)", () => {
    it("creates a direct invoice with line items, quantities, and discounts", async () => {
      const db = createMockBillingDb({ role: "STAFF" });

      const newInv = await createDirectInvoice(db, staffUserId, clinicId, {
        clinicId,
        patientId,
        items: [
          { description: "General OPD Consultation", quantity: 1, unit_price: 400, discount: 0 },
          { description: "Blood Glucose Test", quantity: 1, unit_price: 150, discount: 0 },
          { description: "Rx: Antipyretic", quantity: 2, unit_price: 35, discount: 10 }, // 70 - 10 = 60
        ],
        discountType: "FIXED",
        discountValue: 50,
        finalize: true,
      });

      // Gross = 400 + 150 + 70 = 620
      // Line discount = 10, Invoice discount = 50 -> Total discount = 60
      // Total amount = 620 - 60 = 560
      expect(newInv.subtotal).toBe(620);
      expect(newInv.discount).toBe(60);
      expect(newInv.total_amount).toBe(560);
      expect(newInv.status).toBe("ISSUED");
    });
  });

  describe("7. Finalize Bill Idempotency & Lifecycle Regressions", () => {
    function createStatefulBillingDb(initialOptions: {
      role?: "OWNER" | "STAFF";
      initialStatus?: "DRAFT" | "ISSUED" | "PAID";
      initialItems?: Array<{ id: string; description: string; quantity: number; unit_price: number; total: number; invoice_id?: string }>;
      amountPaid?: number;
    }) {
      let invoice = {
        id: invoiceId,
        clinic_id: clinicId,
        patient_id: patientId,
        appointment_id: appointmentId,
        invoice_number: "INV-20261029-TEST",
        status: initialOptions.initialStatus ?? "DRAFT",
        subtotal: 500,
        tax: 0,
        discount: 0,
        total_amount: 500,
        amount_paid: initialOptions.amountPaid ?? 0,
        amount_due: 500 - (initialOptions.amountPaid ?? 0),
        issued_at: initialOptions.initialStatus === "ISSUED" ? "2026-10-29T10:00:00Z" : null,
        created_by: userId,
        created_at: "2026-10-29T09:00:00Z",
        updated_at: "2026-10-29T09:00:00Z",
      };

      let items = initialOptions.initialItems ? [...initialOptions.initialItems] : [];
      const auditLogs: any[] = [];
      const payments: any[] = [];

      const from = (table: string) => {
        let pendingInsert: any = null;
        let pendingUpdate: any = null;
        let pendingDelete = false;

        const chain: any = {
          select: () => chain,
          order: () => chain,
          limit: () => chain,
          eq: (_col: string, _val: any) => chain,
          delete: () => {
            pendingDelete = true;
            return chain;
          },
          insert: (rows: any) => {
            pendingInsert = rows;
            return chain;
          },
          update: (fields: any) => {
            pendingUpdate = fields;
            return chain;
          },
          single: async () => {
            if (table === "invoices") {
              if (pendingUpdate) {
                invoice = { ...invoice, ...pendingUpdate };
              }
              return {
                data: {
                  ...invoice,
                  patient: { id: patientId, patient_number: "P-1001", first_name: "Anita", last_name: "Sharma", phone: "9876543210" },
                  appointment: { id: appointmentId, scheduled_start: "2026-10-29T10:00:00Z", scheduled_end: "2026-10-29T10:30:00Z", appointment_type: "IN_PERSON" },
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          maybeSingle: async () => {
            if (table === "profiles") return { data: { platform_role: "USER", status: "ACTIVE" }, error: null };
            if (table === "clinic_members") return { data: { role: initialOptions.role ?? "STAFF", status: "ACTIVE" }, error: null };
            if (table === "invoices") return { data: invoice, error: null };
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            if (pendingDelete && table === "invoice_items") {
              items = [];
              resolve({ data: [], error: null });
              return;
            }
            if (pendingInsert && table === "invoice_items") {
              const toAdd = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert];
              for (const item of toAdd) {
                items.push({
                  id: item.id || `item-${items.length + 1}`,
                  ...item,
                });
              }
              resolve({ data: toAdd, error: null });
              return;
            }
            if (pendingInsert && table === "audit_logs") {
              auditLogs.push(pendingInsert);
              resolve({ data: pendingInsert, error: null });
              return;
            }
            if (table === "profiles") {
              resolve({ data: [{ id: userId, platform_role: "USER", status: "ACTIVE" }], error: null });
              return;
            }
            if (table === "clinic_members") {
              resolve({
                data: [
                  { clinic_id: clinicId, user_id: userId, role: initialOptions.role ?? "STAFF", status: "ACTIVE" },
                  { clinic_id: clinicId, user_id: staffUserId, role: initialOptions.role ?? "STAFF", status: "ACTIVE" },
                ],
                error: null,
              });
              return;
            }
            if (table === "invoice_items") {
              resolve({ data: [...items], error: null });
              return;
            }
            if (table === "payments") {
              resolve({ data: [...payments], error: null });
              return;
            }
            resolve({ data: [], error: null });
          },
        };
        return chain;
      };

      return {
        from,
        rpc: vi.fn(async (procName: string) => {
          if (procName === "clinic_is_operational") {
            return { data: true, error: null };
          }
          return { data: null, error: null };
        }),
        getItems: () => items,
        getInvoice: () => invoice,
        auditLogs,
      } as any;
    }

    it("Mandatory Case: Repeated finalization leaves invoice item set, invoice ID, and totals unchanged", async () => {
      // 1. Consultation creates invoice with 1 consultation fee + 3 prescription items (some unpriced)
      const initialItems = [
        { id: "fee-1", invoice_id: invoiceId, description: "Doctor Consultation Fee", quantity: 1, unit_price: 500, total: 500 },
        { id: "med-1", invoice_id: invoiceId, description: "Rx: Amoxicillin 500mg", quantity: 10, unit_price: 0, total: 0 },
        { id: "med-2", invoice_id: invoiceId, description: "Rx: Paracetamol 650mg", quantity: 15, unit_price: 0, total: 0 },
        { id: "med-3", invoice_id: invoiceId, description: "Rx: Cetirizine 10mg", quantity: 5, unit_price: 0, total: 0 },
      ];

      const db = createStatefulBillingDb({
        role: "STAFF",
        initialStatus: "DRAFT",
        initialItems,
      });

      // 2. Open invoice & verify initial draft state
      expect(db.getItems().length).toBe(4);
      expect(db.getInvoice().status).toBe("DRAFT");

      // 3. Enter prices for medicines & finalize the bill
      const pricedItems = [
        { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500, discount: 0 },
        { description: "Rx: Amoxicillin 500mg", quantity: 10, unit_price: 18, discount: 0 }, // 180
        { description: "Rx: Paracetamol 650mg", quantity: 15, unit_price: 4, discount: 0 },  // 60
        { description: "Rx: Cetirizine 10mg", quantity: 5, unit_price: 8, discount: 0 },     // 40
      ];

      const finalized1 = await updateInvoiceBilling(db, staffUserId, clinicId, {
        clinicId,
        invoiceId,
        items: pricedItems,
        finalize: true,
      });

      // 4. Record baseline finalized state
      expect(finalized1.id).toBe(invoiceId);
      expect(finalized1.status).toBe("ISSUED");
      expect(finalized1.items.length).toBe(4);
      expect(finalized1.subtotal).toBe(780);
      expect(finalized1.total_amount).toBe(780);
      expect(finalized1.amount_due).toBe(780);

      const baselineId = finalized1.id;
      const baselineItemCount = finalized1.items.length;
      const baselineTotal = finalized1.total_amount;

      // 5. Click "Finalize Bill" a 2nd time
      const finalized2 = await updateInvoiceBilling(db, staffUserId, clinicId, {
        clinicId,
        invoiceId,
        items: pricedItems,
        finalize: true,
      });

      // 6-12. Verify invoice ID, item count, and item breakdown
      expect(finalized2.id).toBe(baselineId);
      expect(finalized2.items.length).toBe(baselineItemCount);
      expect(finalized2.total_amount).toBe(baselineTotal);
      expect(finalized2.amount_due).toBe(baselineTotal);

      // Verify consultation fee appears exactly once
      const consultFees = finalized2.items.filter((it: any) =>
        it.description.toLowerCase().includes("consultation fee")
      );
      expect(consultFees.length).toBe(1);
      expect(consultFees[0]?.unit_price).toBe(500);

      // Verify each intended prescription item appears exactly once with positive unit_price
      const amoxItems = finalized2.items.filter((it: any) => it.description.includes("Amoxicillin"));
      expect(amoxItems.length).toBe(1);
      expect(amoxItems[0]?.unit_price).toBe(18);

      const paraItems = finalized2.items.filter((it: any) => it.description.includes("Paracetamol"));
      expect(paraItems.length).toBe(1);
      expect(paraItems[0]?.unit_price).toBe(4);

      const cetiItems = finalized2.items.filter((it: any) => it.description.includes("Cetirizine"));
      expect(cetiItems.length).toBe(1);
      expect(cetiItems[0]?.unit_price).toBe(8);

      // Verify no price-less items exist
      const unpriced = finalized2.items.filter((it: any) => it.unit_price <= 0);
      expect(unpriced.length).toBe(0);

      // Repeat finalization at least 3 more times (total 5 times)
      for (let i = 3; i <= 5; i++) {
        const repeatRes = await updateInvoiceBilling(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          items: pricedItems,
          finalize: true,
        });

        expect(repeatRes.id).toBe(baselineId);
        expect(repeatRes.items.length).toBe(baselineItemCount);
        expect(repeatRes.total_amount).toBe(baselineTotal);
        expect(repeatRes.amount_due).toBe(baselineTotal);
        expect(repeatRes.status).toBe("ISSUED");
        expect(repeatRes.items.filter((it: any) => it.unit_price <= 0).length).toBe(0);
      }
    });

    it("Save draft repeatedly: leaves item count stable and retains DRAFT status", async () => {
      const db = createStatefulBillingDb({
        role: "STAFF",
        initialStatus: "DRAFT",
        initialItems: [
          { id: "fee-1", invoice_id: invoiceId, description: "Doctor Consultation Fee", quantity: 1, unit_price: 500, total: 500 },
          { id: "med-1", invoice_id: invoiceId, description: "Rx: Medicine A", quantity: 1, unit_price: 0, total: 0 },
        ],
      });

      // Save draft 3 times with adjustments
      for (let i = 1; i <= 3; i++) {
        const res = await updateInvoiceBilling(db, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          items: [
            { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500, discount: 0 },
            { description: "Rx: Medicine A", quantity: 1, unit_price: i * 10, discount: 0 },
          ],
          finalize: false, // Save draft
        });

        expect(res.status).toBe("DRAFT");
        expect(res.items.length).toBe(2);
        expect(db.getItems().length).toBe(2);
      }
    });

    it("Double-click / concurrent Finalize Bill: resolves idempotently without duplication", async () => {
      const db = createStatefulBillingDb({
        role: "STAFF",
        initialStatus: "DRAFT",
        initialItems: [
          { id: "fee-1", invoice_id: invoiceId, description: "Doctor Consultation Fee", quantity: 1, unit_price: 500, total: 500 },
          { id: "med-1", invoice_id: invoiceId, description: "Rx: Medicine B", quantity: 2, unit_price: 0, total: 0 },
        ],
      });

      const payload = {
        clinicId,
        invoiceId,
        items: [
          { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500, discount: 0 },
          { description: "Rx: Medicine B", quantity: 2, unit_price: 75, discount: 0 },
        ],
        finalize: true,
      };

      // Simulate simultaneous double-click
      const [res1, res2] = await Promise.all([
        updateInvoiceBilling(db, staffUserId, clinicId, payload),
        updateInvoiceBilling(db, staffUserId, clinicId, payload),
      ]);

      expect(res1.id).toBe(res2.id);
      expect(res1.items.length).toBe(2);
      expect(res2.items.length).toBe(2);
      expect(res1.total_amount).toBe(650);
      expect(res2.total_amount).toBe(650);
    });

    it("Attempt finalization after invoice is paid: rejects with historical preservation error", async () => {
      const dbPaid = createStatefulBillingDb({
        role: "STAFF",
        initialStatus: "PAID",
        amountPaid: 700,
        initialItems: [
          { id: "fee-1", invoice_id: invoiceId, description: "Doctor Consultation Fee", quantity: 1, unit_price: 500, total: 500 },
          { id: "med-1", invoice_id: invoiceId, description: "Rx: Medicine Paid", quantity: 1, unit_price: 200, total: 200 },
        ],
      });

      await expect(
        updateInvoiceBilling(dbPaid, staffUserId, clinicId, {
          clinicId,
          invoiceId,
          items: [
            { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500 },
            { description: "Rx: Medicine Paid", quantity: 1, unit_price: 200 },
          ],
          finalize: true,
        })
      ).rejects.toThrow("Cannot modify a paid invoice. Historical invoice prices and totals are preserved.");
    });

    it("Pricing-state warning: accurately reflects required unpriced items vs priced invoices", () => {
      // 1. Incomplete draft with 0-priced medicine -> hasMissingPrices is true
      const draftWithMissing = calculateInvoiceTotals({
        items: [
          { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500 },
          { description: "Rx: Unpriced Drug", quantity: 1, unit_price: 0 },
        ],
      });
      expect(draftWithMissing.hasMissingPrices).toBe(true);

      // 2. Properly priced finalized invoice -> hasMissingPrices is false
      const properlyPriced = calculateInvoiceTotals({
        items: [
          { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500 },
          { description: "Rx: Priced Drug", quantity: 1, unit_price: 45 },
        ],
      });
      expect(properlyPriced.hasMissingPrices).toBe(false);

      // 3. Paid invoice with valid persisted prices -> hasMissingPrices is false
      const settledPaid = calculateInvoiceTotals({
        items: [
          { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500 },
          { description: "Rx: Settled Drug", quantity: 2, unit_price: 100 },
        ],
        amountPaid: 700,
      });
      expect(settledPaid.hasMissingPrices).toBe(false);
      expect(settledPaid.amountDue).toBe(0);

      // 4. Incomplete invoice with positive total (consultation fee > 0) still shows missing price
      const mixedIncomplete = calculateInvoiceTotals({
        items: [
          { description: "Doctor Consultation Fee", quantity: 1, unit_price: 500 }, // Positive
          { description: "Rx: Still Unpriced", quantity: 1, unit_price: 0 },       // Missing
        ],
      });
      expect(mixedIncomplete.subtotal).toBe(500);
      expect(mixedIncomplete.hasMissingPrices).toBe(true); // Must NOT treat positive total as proof of completeness
    });
  });
});
