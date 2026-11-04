import * as React from "react";
import { Printer, Receipt, ShieldCheck, Stethoscope, Building2, Phone, Calendar, CreditCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { InvoiceWithDetails } from "@/lib/clinical";
import { formatINR } from "@/lib/billing-calculations";

interface PatientInvoiceReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceWithDetails | null;
}

export function PatientInvoiceReceiptDialog({
  open,
  onOpenChange,
  invoice,
}: PatientInvoiceReceiptDialogProps) {
  if (!invoice) return null;

  const clinicName = invoice.clinic?.name || "CareFlow Medical Clinic";
  const clinicAddress = invoice.clinic?.address || "CareFlow Health Suite, Medical District";
  const clinicPhone = invoice.clinic?.phone;
  const patient = invoice.patient;
  const patientName = patient ? `${patient.first_name} ${patient.last_name || ""}`.trim() : "Patient";

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const isPaid = invoice.status === "PAID";
  const isPartiallyPaid = invoice.status === "PARTIALLY_PAID";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print:p-0 print:border-none print:shadow-none print:max-w-full">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Official Invoice &amp; Payment Receipt
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Printable Receipt Paper Container */}
        <div id="printable-invoice" className="bg-card border rounded-lg p-6 sm:p-8 space-y-6 text-card-foreground print:border-none print:p-0 print:bg-white print:text-black">
          {/* Clinic Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-5">
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-bold tracking-tight text-primary">
                  {clinicName}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {clinicAddress}
                {clinicPhone && ` • Tel: ${clinicPhone}`}
              </p>
            </div>
            <div className="text-left sm:text-right space-y-1">
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase block">
                Official Bill / Receipt
              </span>
              <p className="font-bold text-base text-foreground font-mono">
                #{invoice.invoice_number}
              </p>
              <div>
                {isPaid ? (
                  <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">
                    PAID IN FULL
                  </Badge>
                ) : isPartiallyPaid ? (
                  <Badge className="bg-amber-600 text-white text-[10px] px-2 py-0.5">
                    PARTIALLY PAID
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-primary text-primary">
                    {invoice.status}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Invoice & Patient Demographics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/40 text-xs">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Billed To</span>
              <span className="font-semibold text-foreground text-sm block">
                {patientName}
              </span>
              {patient?.patient_number && (
                <span className="text-[11px] text-muted-foreground">ID: #{patient.patient_number}</span>
              )}
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Contact</span>
              <span className="font-medium text-foreground">
                {patient?.phone || "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Issue Date</span>
              <span className="font-medium text-foreground">
                {formatDate(invoice.issued_at || invoice.created_at)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Payment Terms</span>
              <span className="font-medium text-foreground">
                {isPaid ? "Settled" : "Due upon receipt"}
              </span>
            </div>
          </div>

          {/* Itemized Services & Medications Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Itemized Charges &amp; Clinical Services
            </h3>
            <div className="border rounded-md overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-muted/60 border-b text-[11px] font-semibold text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-center w-16">Qty</th>
                    <th className="py-2.5 px-3 text-right w-24">Unit Price</th>
                    <th className="py-2.5 px-3 text-right w-24">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoice.items && invoice.items.length > 0 ? (
                    invoice.items.map((it, idx) => (
                      <tr key={it.id || idx} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 font-medium text-foreground">
                          {it.description}
                        </td>
                        <td className="py-2.5 px-3 text-center text-muted-foreground">
                          {it.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                          {formatINR(Number(it.unit_price) || 0)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-foreground">
                          {formatINR(Number(it.total) || 0)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted-foreground">
                        Standard consultation charges
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="flex justify-end pt-2">
            <div className="w-full sm:w-64 space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatINR(Number(invoice.subtotal) || 0)}</span>
              </div>
              {Number(invoice.discount) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span>- {formatINR(Number(invoice.discount))}</span>
                </div>
              )}
              {Number(invoice.tax) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>{formatINR(Number(invoice.tax))}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-sm font-bold text-foreground">
                <span>Total Amount</span>
                <span>{formatINR(Number(invoice.total_amount) || 0)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Amount Paid</span>
                <span className="font-semibold text-emerald-600">
                  {formatINR(Number(invoice.amount_paid) || 0)}
                </span>
              </div>
              <div className="flex justify-between text-xs font-semibold pt-1 border-t">
                <span className={Number(invoice.amount_due) > 0 ? "text-amber-600" : "text-muted-foreground"}>
                  Balance Due
                </span>
                <span className={Number(invoice.amount_due) > 0 ? "text-amber-600 font-bold" : "text-muted-foreground"}>
                  {formatINR(Number(invoice.amount_due) || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Transactions Section (if any recorded) */}
          {invoice.payments && invoice.payments.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                Payment Record History
              </h4>
              <div className="space-y-1.5">
                {invoice.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between p-2 rounded bg-muted/30 border text-[11px]"
                  >
                    <div>
                      <span className="font-semibold text-foreground">
                        {p.payment_method}
                      </span>
                      {p.transaction_reference && (
                        <span className="text-muted-foreground ml-2">
                          (Ref: {p.transaction_reference})
                        </span>
                      )}
                      <span className="text-muted-foreground block text-[10px]">
                        Paid on {formatDate(p.paid_at || p.created_at)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-600">
                        {formatINR(Number(p.amount) || 0)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        Status: {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security & Verification Footer */}
          <div className="border-t pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Official computerized billing record generated via CAREFLOW AI Clinical Suite.</span>
            </div>
            <span>Generated: {new Date().toLocaleDateString("en-IN")}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

