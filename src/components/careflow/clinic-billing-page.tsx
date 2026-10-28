import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  Receipt,
  Search,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertCircle,
  FileText,
  IndianRupee,
  Layers,
  ArrowUpRight,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clinicInvoicesQuery } from "@/lib/clinical-queries";
import { recordInvoicePaymentFn } from "@/lib/clinical.functions";
import type { InvoiceWithDetails } from "@/lib/clinical";
import { toast } from "sonner";

interface ClinicBillingPageProps {
  clinicId: string;
}

export function ClinicBillingPage({ clinicId }: ClinicBillingPageProps) {
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");

  // Payment Dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false);
  const [activeInvoice, setActiveInvoice] = React.useState<InvoiceWithDetails | null>(null);
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<"CASH" | "CARD" | "UPI" | "NET_BANKING">("UPI");
  const [paymentNotes, setPaymentNotes] = React.useState("");

  // Items detail dialog state
  const [detailsDialogOpen, setDetailsDialogOpen] = React.useState(false);
  const [detailedInvoice, setDetailedInvoice] = React.useState<InvoiceWithDetails | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    ...clinicInvoicesQuery(clinicId, statusFilter === "ALL" ? undefined : statusFilter),
  });

  const filteredInvoices = React.useMemo(() => {
    return invoices.filter((inv) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const patientName = `${inv.patient?.first_name || ""} ${inv.patient?.last_name || ""}`.toLowerCase();
      const patientNum = (inv.patient?.patient_number || "").toLowerCase();
      const invId = inv.id.toLowerCase();
      return patientName.includes(q) || patientNum.includes(q) || invId.includes(q);
    });
  }, [invoices, search]);

  // Aggregate metrics
  const metrics = React.useMemo(() => {
    let totalBilled = 0;
    let totalCollected = 0;
    let totalDue = 0;
    let paidCount = 0;

    for (const inv of invoices) {
      totalBilled += inv.total_amount;
      totalCollected += inv.amount_paid;
      totalDue += inv.amount_due;
      if (inv.status === "PAID") paidCount++;
    }

    return {
      totalBilled,
      totalCollected,
      totalDue,
      invoiceCount: invoices.length,
      paidCount,
    };
  }, [invoices]);

  const openPaymentDialog = (inv: InvoiceWithDetails) => {
    setActiveInvoice(inv);
    setPaymentAmount(inv.amount_due.toString());
    setPaymentMethod("UPI");
    setPaymentNotes("");
    setPaymentDialogOpen(true);
  };

  const openDetailsDialog = (inv: InvoiceWithDetails) => {
    setDetailedInvoice(inv);
    setDetailsDialogOpen(true);
  };

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!activeInvoice) throw new Error("No invoice selected.");
      const amt = parseFloat(paymentAmount);
      if (Number.isNaN(amt) || amt <= 0) {
        throw new Error("Please enter a valid payment amount.");
      }

      return recordInvoicePaymentFn({
        data: {
          clinicId,
          invoiceId: activeInvoice.id,
          amount: amt,
          payment_method: paymentMethod,
          notes: paymentNotes.trim() || undefined,
        },
      });
    },
    onSuccess: (data) => {
      toast.success(
        `Payment of ₹${data.payment.amount} recorded! Invoice is now ${data.invoice.status}.`
      );
      queryClient.invalidateQueries({
        queryKey: ["clinic-invoices", clinicId],
      });
      setPaymentDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to record payment.");
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          Clinic Billing &amp; Invoices
        </h2>
        <p className="text-xs text-muted-foreground">
          Track consultation fees, prescribed medication charges, and record patient payments.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-card shadow-xs space-y-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-primary" />
            Total Invoiced
          </span>
          <p className="text-2xl font-bold tracking-tight text-foreground">
            ₹{metrics.totalBilled.toLocaleString("en-IN")}
          </p>
          <span className="text-[11px] text-muted-foreground">
            {metrics.invoiceCount} generated bill{metrics.invoiceCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="p-4 rounded-xl border bg-card shadow-xs space-y-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Total Collected
          </span>
          <p className="text-2xl font-bold tracking-tight text-emerald-600">
            ₹{metrics.totalCollected.toLocaleString("en-IN")}
          </p>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
            {metrics.invoiceCount > 0
              ? `${Math.round((metrics.paidCount / metrics.invoiceCount) * 100)}% settlement rate`
              : "0%"}
          </span>
        </div>

        <div className="p-4 rounded-xl border bg-card shadow-xs space-y-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-amber-500" />
            Outstanding Due
          </span>
          <p className="text-2xl font-bold tracking-tight text-amber-600">
            ₹{metrics.totalDue.toLocaleString("en-IN")}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Pending collection from patients
          </span>
        </div>

        <div className="p-4 rounded-xl border bg-card shadow-xs space-y-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-blue-500" />
            Paid Invoices
          </span>
          <p className="text-2xl font-bold tracking-tight text-foreground">
            {metrics.paidCount} / {metrics.invoiceCount}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Completed patient visits
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl border bg-card shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by patient name or patient number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Bills</SelectItem>
              <SelectItem value="ISSUED" className="text-xs">Pending / Issued</SelectItem>
              <SelectItem value="PARTIALLY_PAID" className="text-xs">Partially Paid</SelectItem>
              <SelectItem value="PAID" className="text-xs">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Invoices Table */}
      {isLoading ? (
        <div className="text-center py-16 border rounded-xl bg-card space-y-3">
          <Receipt className="h-8 w-8 text-primary mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading clinic invoices...</p>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl bg-card/60 space-y-3">
          <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <h3 className="text-base font-semibold text-foreground">No invoices found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {search || statusFilter !== "ALL"
              ? "No billing records match your search filter."
              : "Invoices are automatically generated when doctors complete consultations."}
          </p>
        </div>
      ) : (
        <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b text-muted-foreground font-semibold">
                <tr>
                  <th className="py-3 px-4">Invoice / Date</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4">Billed Items</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4">Amount Paid</th>
                  <th className="py-3 px-4">Balance Due</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredInvoices.map((inv) => {
                  const patient = inv.patient;
                  const isPaid = inv.status === "PAID";
                  const isPartial = inv.status === "PARTIALLY_PAID";

                  return (
                    <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-bold text-foreground block">
                          #{inv.id.substring(0, 8).toUpperCase()}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(inv.created_at).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground text-sm">
                          {patient ? `${patient.first_name} ${patient.last_name}` : "Patient"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {patient?.patient_number ? `ID: #${patient.patient_number}` : ""}
                          {patient?.phone ? ` • ${patient.phone}` : ""}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <button
                          type="button"
                          onClick={() => openDetailsDialog(inv)}
                          className="text-left group cursor-pointer"
                        >
                          <div className="flex flex-wrap items-center gap-1">
                            {inv.items.map((item, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-[10px] group-hover:border-primary transition-colors"
                              >
                                {item.description} (₹{item.total})
                              </Badge>
                            ))}
                          </div>
                        </button>
                      </td>

                      <td className="py-3 px-4 font-bold text-foreground whitespace-nowrap">
                        ₹{inv.total_amount.toLocaleString("en-IN")}
                      </td>

                      <td className="py-3 px-4 text-emerald-600 font-semibold whitespace-nowrap">
                        ₹{inv.amount_paid.toLocaleString("en-IN")}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            inv.amount_due > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                          }`}
                        >
                          ₹{inv.amount_due.toLocaleString("en-IN")}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            isPaid
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                              : isPartial
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300"
                              : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300"
                          }`}
                        >
                          {isPaid ? "PAID" : isPartial ? "PARTIAL" : "PENDING"}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDetailsDialog(inv)}
                            className="h-7 text-xs px-2"
                          >
                            Details
                          </Button>

                          {!isPaid && (
                            <Button
                              size="sm"
                              onClick={() => openPaymentDialog(inv)}
                              className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              Pay
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              Record Patient Payment
            </DialogTitle>
            <DialogDescription>
              Collect consultation &amp; medication charges for{" "}
              <span className="font-semibold text-foreground">
                {activeInvoice?.patient?.first_name} {activeInvoice?.patient?.last_name}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          {activeInvoice && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-muted/40 border grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Total Bill
                  </span>
                  <span className="font-bold text-sm text-foreground">
                    ₹{activeInvoice.total_amount}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Outstanding Due
                  </span>
                  <span className="font-bold text-sm text-amber-600">
                    ₹{activeInvoice.amount_due}
                  </span>
                </div>
              </div>

              {/* Amount to Collect */}
              <div className="space-y-1.5">
                <Label htmlFor="payment-amount" className="text-xs font-semibold">
                  Amount to Collect (₹) *
                </Label>
                <Input
                  id="payment-amount"
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  min={1}
                  max={activeInvoice.amount_due}
                  className="font-bold text-base"
                />
              </div>

              {/* Payment Mode */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Method *</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["UPI", "CASH", "CARD", "NET_BANKING"] as const).map((m) => (
                    <Button
                      key={m}
                      type="button"
                      variant={paymentMethod === m ? "default" : "outline"}
                      size="sm"
                      className="text-xs h-8 font-semibold"
                      onClick={() => setPaymentMethod(m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Notes / Reference */}
              <div className="space-y-1.5">
                <Label htmlFor="payment-notes" className="text-xs font-semibold">
                  Reference / Transaction Note (Optional)
                </Label>
                <Input
                  id="payment-notes"
                  placeholder="e.g. UPI Ref: 489218392182"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              type="button"
              onClick={() => setPaymentDialogOpen(false)}
              disabled={paymentMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => paymentMutation.mutate()}
              disabled={paymentMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {paymentMutation.isPending ? "Recording Payment..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Itemized Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Invoice Breakdown #{detailedInvoice?.id.substring(0, 8).toUpperCase()}
            </DialogTitle>
            <DialogDescription>
              Itemized charges for consultation and prescribed medications.
            </DialogDescription>
          </DialogHeader>

          {detailedInvoice && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg border bg-muted/40 text-xs flex justify-between items-center">
                <div>
                  <span className="font-semibold text-foreground text-sm block">
                    {detailedInvoice.patient?.first_name} {detailedInvoice.patient?.last_name}
                  </span>
                  <span className="text-muted-foreground">
                    Patient #{detailedInvoice.patient?.patient_number}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-bold ${
                    detailedInvoice.status === "PAID"
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-300"
                      : "bg-amber-500/10 text-amber-700 border-amber-300"
                  }`}
                >
                  {detailedInvoice.status}
                </Badge>
              </div>

              {/* Items List */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b font-semibold text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detailedInvoice.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-medium text-foreground">
                          {item.description}
                        </td>
                        <td className="py-2.5 px-3 text-center text-muted-foreground">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                          ₹{item.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 font-bold">
                    <tr>
                      <td colSpan={2} className="py-2.5 px-3">
                        Total Amount
                      </td>
                      <td className="py-2.5 px-3 text-right text-sm text-primary">
                        ₹{detailedInvoice.total_amount}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-2 px-3 text-muted-foreground font-normal">
                        Amount Paid
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                        ₹{detailedInvoice.amount_paid}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="py-2 px-3 text-muted-foreground font-normal">
                        Balance Remaining
                      </td>
                      <td className="py-2 px-3 text-right text-amber-600 font-bold">
                        ₹{detailedInvoice.amount_due}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Payment History if any */}
              {detailedInvoice.payments.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Recorded Payment History
                  </span>
                  <div className="space-y-1 text-xs">
                    {detailedInvoice.payments.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded border bg-card/60 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-foreground">
                            ₹{p.amount} via {p.payment_method}
                          </span>
                          <span className="text-muted-foreground block text-[10px]">
                            {new Date(p.created_at).toLocaleString()}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] text-emerald-600">
                          {p.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" onClick={() => setDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
