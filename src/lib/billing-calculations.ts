/**
 * CAREFLOW AI — Financial Calculation and Precision Utilities
 *
 * Implements strict, currency-safe calculations for line items,
 * discounts (fixed and percentage), and invoice totals.
 *
 * Rules:
 *  - Gross amount = Unit price × Quantity
 *  - Line total = Math.max(0, Gross amount - Line discount)
 *  - Discounts cannot exceed the applicable subtotal/gross amount.
 *  - Final payable amount cannot become negative.
 *  - Consistent 2-decimal precision (paise) avoids floating-point anomalies.
 */

export interface LineItemCalculationInput {
  id?: string | undefined;
  description: string;
  quantity: number;
  unit_price: number;
  discount?: number | null | undefined;
}

export interface CalculatedLineItem {
  id?: string | undefined;
  description: string;
  quantity: number;
  unit_price: number;
  gross_amount: number;
  discount: number;
  total: number;
  is_missing_price: boolean;
}

export type DiscountType = "FIXED" | "PERCENTAGE";

export interface InvoiceCalculationInput {
  items: LineItemCalculationInput[];
  discountType?: DiscountType | undefined;
  discountValue?: number | undefined;
  amountPaid?: number | undefined;
}

export interface CalculatedInvoiceTotals {
  items: CalculatedLineItem[];
  subtotal: number; // Gross total of all line items
  totalLineDiscounts: number;
  invoiceDiscount: number;
  totalDiscount: number; // Total discounts applied (line + invoice)
  totalAmount: number; // Final net payable amount
  amountPaid: number;
  amountDue: number; // Outstanding balance
  hasMissingPrices: boolean; // True if any medicine item lacks a valid positive price
}

/**
 * Rounds a currency amount to 2 decimal places to avoid IEEE 754 float drift.
 */
export function roundCurrency(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Consistently format amounts in Indian Rupees (₹)
 */
export function formatINR(amount: number): string {
  const rounded = roundCurrency(amount);
  return `₹${rounded.toLocaleString("en-IN", {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Calculates a single line item's gross, discount, and final line amount.
 */
export function calculateLineItem(item: LineItemCalculationInput): CalculatedLineItem {
  const unit_price = Math.max(0, roundCurrency(Number(item.unit_price) || 0));
  const quantity = Math.max(0.01, roundCurrency(Number(item.quantity) || 1));
  const gross_amount = roundCurrency(unit_price * quantity);

  // Line discount is clamped so line total cannot be negative
  const requestedDiscount = Math.max(0, roundCurrency(Number(item.discount) || 0));
  const discount = Math.min(gross_amount, requestedDiscount);
  const total = roundCurrency(gross_amount - discount);

  // Consider price missing if unit_price is 0 and description suggests a medication or billable service
  const isMedication = item.description.toLowerCase().startsWith("rx:") || item.description.toLowerCase().includes("medicine");
  const is_missing_price = unit_price <= 0 && isMedication;

  return {
    id: item.id,
    description: item.description.trim(),
    quantity,
    unit_price,
    gross_amount,
    discount,
    total,
    is_missing_price,
  };
}

/**
 * Calculates complete invoice totals including line discounts, invoice-level discounts,
 * gross subtotal, final payable amount, and remaining balance due.
 */
export function calculateInvoiceTotals(input: InvoiceCalculationInput): CalculatedInvoiceTotals {
  const calculatedItems = input.items.map(calculateLineItem);

  const subtotal = roundCurrency(
    calculatedItems.reduce((acc, it) => acc + it.gross_amount, 0)
  );

  const totalLineDiscounts = roundCurrency(
    calculatedItems.reduce((acc, it) => acc + it.discount, 0)
  );

  // Eligible amount for invoice-level discount after line discounts
  const eligibleForInvoiceDiscount = Math.max(0, roundCurrency(subtotal - totalLineDiscounts));

  let invoiceDiscount = 0;
  const discountType = input.discountType ?? "FIXED";
  const rawDiscountValue = Math.max(0, Number(input.discountValue) || 0);

  if (discountType === "PERCENTAGE") {
    // Validate percentage within 0-100%
    const validPercent = Math.min(100, Math.max(0, rawDiscountValue));
    invoiceDiscount = roundCurrency((eligibleForInvoiceDiscount * validPercent) / 100);
  } else {
    // Fixed amount cannot exceed eligible amount
    invoiceDiscount = Math.min(eligibleForInvoiceDiscount, roundCurrency(rawDiscountValue));
  }

  const totalDiscount = roundCurrency(totalLineDiscounts + invoiceDiscount);
  const totalAmount = Math.max(0, roundCurrency(subtotal - totalDiscount));

  const amountPaid = Math.max(0, roundCurrency(Number(input.amountPaid) || 0));
  const amountDue = Math.max(0, roundCurrency(totalAmount - amountPaid));

  const hasMissingPrices = calculatedItems.some((it) => it.is_missing_price);

  return {
    items: calculatedItems,
    subtotal,
    totalLineDiscounts,
    invoiceDiscount,
    totalDiscount,
    totalAmount,
    amountPaid,
    amountDue,
    hasMissingPrices,
  };
}
