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
  Layers,
  Pencil,
  Plus,
  Trash2,
  Percent,
  Tag,
  AlertTriangle,
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
import { recordInvoicePaymentFn, updateInvoiceBillingFn } from "@/lib/clinical.functions";
import type { InvoiceWithDetails } from "@/lib/clinical";
import {
  calculateInvoiceTotals,
  formatINR,
  type DiscountType,
} from "@/lib/billing-calculations";
import { toast } from "sonner";

interface ClinicBillingPageProps {
  clinicId: string;
}

interface EditableBillItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
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

  // Pricing & Discounts Edit Dialog state
  const [pricingDialogOpen, setPricingDialogOpen] = React.useState(false);
  const [pricingInvoice, setPricingInvoice] = React.useState<InvoiceWithDetails | null>(null);
  const [editItems, setEditItems] = React.useState<EditableBillItem[]>([]);
  const [editDiscountType, setEditDiscountType] = React.useState<DiscountType>("FIXED");
  const [editDiscountValue, setEditDiscountValue] = React.useState<string>("0");

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
    let draftCount = 0;

    for (const inv of invoices) {
      totalBilled += inv.total_amount;
      totalCollected += inv.amount_paid;
      totalDue += inv.amount_due;
      if (inv.status === "PAID") paidCount++;
      if (inv.status === "DRAFT") draftCount++;
    }

    return {
      totalBilled,
      totalCollected,
      totalDue,
      invoiceCount: invoices.length,
      paidCount,
      draftCount,
    };
  }, [invoices]);

  const openPaymentDialog = (inv: InvoiceWithDetails) => {
    if (inv.status === "DRAFT") {
      toast.warning("This invoice is currently in DRAFT status. Please set medicine prices and finalize the bill before collecting payment.");
      openPricingDialog(inv);
      return;
    }
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

  const openPricingDialog = (inv: InvoiceWithDetails) => {
    setPricingInvoice(inv);
    const initialItems: EditableBillItem[] = (inv.items || []).map((it) => ({
      id: it.id,
      description: it.description,
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || 0,
      discount: 0,
    }));

    if (initialItems.length === 0) {
      initialItems.push({
        description: "Doctor Consultation Fee",
        quantity: 1,
        unit_price: 500,
        discount: 0,
      });
    }

    setEditItems(initialItems);
    setEditDiscountType("FIXED");
    setEditDiscountValue(inv.discount ? inv.discount.toString() : "0");
    setPricingDialogOpen(true);
  };

  // Real-time calculation for pricing dialog
  const liveTotals = React.useMemo(() => {
    return calculateInvoiceTotals({
      items: editItems,
      discountType: editDiscountType,
      discountValue: parseFloat(editDiscountValue) || 0,
      amountPaid: pricingInvoice?.amount_paid || 0,
    });
  }, [editItems, editDiscountType, editDiscountValue, pricingInvoice]);

  const handleItemChange = (index: number, field: keyof EditableBillItem, val: string | number) => {
    setEditItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index]! };

      if (field === "unit_price") {
        const num = parseFloat(val as string);
        item.unit_price = Number.isNaN(num) ? 0 : Math.max(0, num);
      } else if (field === "quantity") {
        const num = parseFloat(val as string);
        item.quantity = Number.isNaN(num) || num <= 0 ? 1 : num;
      } else if (field === "discount") {
        const num = parseFloat(val as string);
        item.discount = Number.isNaN(num) ? 0 : Math.max(0, num);
      } else if (field === "description") {
        item.description = String(val);
      }

      copy[index] = item;
      return copy;
    });
  };

  const handleAddItem = () => {
    setEditItems((prev) => [
      ...prev,
      {
        description: "",
        quantity: 1,
        unit_price: 0,
        discount: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (editItems.length <= 1) {
      toast.error("Invoice must have at least one billable item.");
      return;
    }
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Payment Recording Mutation
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
        `Payment of ${formatINR(data.payment.amount)} recorded! Invoice is now ${data.invoice.status}.`
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

  // Invoice Pricing & Discount Update Mutation
  const pricingMutation = useMutation({
    mutationFn: async (finalize: boolean) => {
      if (!pricingInvoice) throw new Error("No invoice selected.");

      // Front-end validations
      for (const it of editItems) {
        if (!it.description.trim()) {
          throw new Error("All items must have a description.");
        }
        if (it.unit_price < 0) {
          throw new Error(`Unit price for '${it.description}' cannot be negative.`);
        }
        if (it.quantity <= 0) {
          throw new Error(`Quantity for '${it.description}' must be greater than 0.`);
        }
      }

      if (finalize) {
        for (const it of editItems) {
          if (it.unit_price <= 0) {
            throw new Error(`Medicine '${it.description}' has no price. Enter a valid unit price before finalizing the invoice.`);
          }
        }
      }

      const discVal = parseFloat(editDiscountValue) || 0;
      if (editDiscountType === "PERCENTAGE" && (discVal < 0 || discVal > 100)) {
        throw new Error("Percentage discount must be between 0% and 100%.");
      }

      return updateInvoiceBillingFn({
        data: {
          clinicId,
          invoiceId: pricingInvoice.id,
          items: editItems.map((it) => ({
            id: it.id,
            description: it.description.trim(),
            quantity: it.quantity,
            unit_price: it.unit_price,
            discount: it.discount || 0,
          })),
          discountType: editDiscountType,
          discountValue: discVal,
          finalize,
        },
      });
    },
    onSuccess: (data, finalize) => {
      if (finalize) {
        toast.success(`Invoice #${data.id.substring(0, 8).toUpperCase()} finalized and issued! Total payable: ${formatINR(data.total_amount)}.`);
      } else {
        toast.success("Draft pricing and discounts saved successfully.");
      }
      queryClient.invalidateQueries({
        queryKey: ["clinic-invoices", clinicId],
      });
      setPricingDialogOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to save invoice pricing.");
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
          Track consultation charges, set accurate medicine pricing, apply patient discounts, and record settled payments.
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
            {formatINR(metrics.totalBilled)}
          </p>
          <span className="text-[11px] text-muted-foreground">
            {metrics.invoiceCount} bill{metrics.invoiceCount === 1 ? "" : "s"} generated
            {metrics.draftCount > 0 ? ` (${metrics.draftCount} draft)` : ""}
          </span>
        </div>

        <div className="p-4 rounded-xl border bg-card shadow-xs space-y-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Total Collected
          </span>
          <p className="text-2xl font-bold tracking-tight text-emerald-600">
            {formatINR(metrics.totalCollected)}
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
            {formatINR(metrics.totalDue)}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Pending collection from patients
          </span>
        </div>

        <div className="p-4 rounded-xl border bg-card shadow-xs space-y-1">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-blue-500" />
            Settled Invoices
          </span>
          <p className="text-2xl font-bold tracking-tight text-foreground">
            {metrics.paidCount} / {metrics.invoiceCount}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Fully paid patient visits
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
            <SelectTrigger className="w-44 h-9 text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">All Bills</SelectItem>
              <SelectItem value="DRAFT" className="text-xs">Draft / Pricing Needed</SelectItem>
              <SelectItem value="ISSUED" className="text-xs">Issued / Unpaid</SelectItem>
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
              : "Invoices are automatically initialized when doctors complete consultations."}
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
                  <th className="py-3 px-4">Subtotal / Discount</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4">Paid</th>
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
                  const isDraft = inv.status === "DRAFT";
                  const hasUnpriced = inv.items.some(
                    (it) => it.unit_price <= 0 && (it.description.toLowerCase().startsWith("rx:") || it.description.toLowerCase().includes("medicine"))
                  );

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
                          {patient ? `${patient.first_name} ${patient.last_name || ""}`.trim() : "Patient"}
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
                            {inv.items.map((item, i) => {
                              const unpriced = item.unit_price <= 0;
                              return (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className={`text-[10px] group-hover:border-primary transition-colors ${
                                    unpriced ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" : ""
                                  }`}
                                >
                                  {item.description} ({unpriced ? "No Price" : formatINR(item.total)})
                                </Badge>
                              );
                            })}
                          </div>
                        </button>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-medium text-foreground block">
                          {formatINR(inv.subtotal)}
                        </span>
                        {inv.discount > 0 && (
                          <span className="text-[10px] text-emerald-600 font-semibold block">
                            Disc: -{formatINR(inv.discount)}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-bold text-foreground whitespace-nowrap">
                        {formatINR(inv.total_amount)}
                      </td>

                      <td className="py-3 px-4 text-emerald-600 font-semibold whitespace-nowrap">
                        {formatINR(inv.amount_paid)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            inv.amount_due > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                          }`}
                        >
                          {formatINR(inv.amount_due)}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold ${
                              isPaid
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                                : isPartial
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300"
                                : isDraft
                                ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-400"
                                : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300"
                            }`}
                          >
                            {isPaid ? "PAID" : isPartial ? "PARTIAL" : isDraft ? "DRAFT" : "ISSUED"}
                          </Badge>
                          {hasUnpriced && (
                            <span className="text-[9px] font-medium text-amber-600 flex items-center gap-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" /> Price needed
                            </span>
                          )}
                        </div>
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
                              variant="outline"
                              onClick={() => openPricingDialog(inv)}
                              className="h-7 text-xs px-2 gap-1 border-primary/30 hover:border-primary text-primary"
                            >
                              <Pencil className="h-3 w-3" />
                              {isDraft ? "Set Prices" : "Edit"}
                            </Button>
                          )}

                          {!isPaid && (
                            <Button
                              size="sm"
                              onClick={() => openPaymentDialog(inv)}
                              className={`h-7 text-xs gap-1 font-medium ${
                                isDraft
                                  ? "bg-muted text-muted-foreground hover:bg-muted/80"
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
                              }`}
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

      {/* Pricing & Discounts Editor Dialog */}
      <Dialog open={pricingDialogOpen} onOpenChange={setPricingDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Invoice Pricing &amp; Discounts #{pricingInvoice?.id.substring(0, 8).toUpperCase()}
            </DialogTitle>
            <DialogDescription>
              Set medicine unit prices, adjust quantities, specify line or invoice discounts, and finalize the payable amount.
            </DialogDescription>
          </DialogHeader>

          {pricingInvoice && (
            <div className="space-y-4 py-2">
              {/* Patient info banner */}
              <div className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-foreground text-sm block">
                    {pricingInvoice.patient?.first_name} {pricingInvoice.patient?.last_name || ""}
                  </span>
                  <span className="text-muted-foreground">
                    Patient #{pricingInvoice.patient?.patient_number || "—"}
                  </span>
                </div>
                <Badge variant="outline" className="font-semibold text-xs">
                  Status: {pricingInvoice.status}
                </Badge>
              </div>

              {/* Warning banner for missing prices */}
              {liveTotals.hasMissingPrices && (
                <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Missing Medicine Pricing</span>
                    Medicine items without a unit price default to ₹0. Please enter the actual unit price before finalizing and issuing this bill.
                  </div>
                </div>
              )}

              {/* Billable Items Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Billable Items &amp; Medications
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddItem}
                    className="h-7 text-xs text-primary gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Item
                  </Button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 border-b font-semibold text-muted-foreground">
                      <tr>
                        <th className="py-2.5 px-3">Item Description</th>
                        <th className="py-2.5 px-2 w-24 text-center">Qty</th>
                        <th className="py-2.5 px-2 w-28 text-right">Unit Price (₹)</th>
                        <th className="py-2.5 px-2 w-24 text-right">Line Disc (₹)</th>
                        <th className="py-2.5 px-3 w-28 text-right">Line Total</th>
                        <th className="py-2.5 px-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {editItems.map((item, idx) => {
                        const calculatedLine = liveTotals.items[idx];
                        const isUnpriced = calculatedLine?.is_missing_price;

                        return (
                          <tr key={idx} className={isUnpriced ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                            <td className="py-2 px-3">
                              <Input
                                value={item.description}
                                onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                                placeholder="Description"
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                value={item.quantity}
                                onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                                className="h-8 text-xs text-center"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                type="number"
                                min={0}
                                step="0.5"
                                value={item.unit_price}
                                onChange={(e) => handleItemChange(idx, "unit_price", e.target.value)}
                                className={`h-8 text-xs text-right font-semibold ${
                                  isUnpriced ? "border-amber-400 focus-visible:ring-amber-400 bg-amber-50/80 dark:bg-amber-950/30" : ""
                                }`}
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                type="number"
                                min={0}
                                step="1"
                                value={item.discount}
                                onChange={(e) => handleItemChange(idx, "discount", e.target.value)}
                                placeholder="0"
                                className="h-8 text-xs text-right"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-foreground whitespace-nowrap">
                              {formatINR(calculatedLine?.total || 0)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveItem(idx)}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Invoice-Level Discount */}
              <div className="p-3 rounded-lg border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-primary" /> Invoice-Level Discount
                  </Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={editDiscountType === "FIXED" ? "default" : "outline"}
                      className="h-6 text-[10px] px-2"
                      onClick={() => setEditDiscountType("FIXED")}
                    >
                      ₹ Fixed Amount
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={editDiscountType === "PERCENTAGE" ? "default" : "outline"}
                      className="h-6 text-[10px] px-2"
                      onClick={() => setEditDiscountType("PERCENTAGE")}
                    >
                      <Percent className="h-2.5 w-2.5 mr-0.5" /> % Percentage
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Input
                      type="number"
                      min={0}
                      max={editDiscountType === "PERCENTAGE" ? 100 : liveTotals.subtotal}
                      value={editDiscountValue}
                      onChange={(e) => setEditDiscountValue(e.target.value)}
                      placeholder={editDiscountType === "PERCENTAGE" ? "e.g. 10%" : "e.g. ₹50"}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>
                  <div className="text-right text-xs">
                    <span className="text-muted-foreground text-[10px] block">Effective Discount</span>
                    <span className="font-bold text-emerald-600">
                      -{formatINR(liveTotals.invoiceDiscount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Comprehensive Live Breakdown Card */}
              <div className="p-3.5 rounded-lg border bg-muted/40 space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Gross Subtotal</span>
                  <span className="font-semibold text-foreground">{formatINR(liveTotals.subtotal)}</span>
                </div>

                {liveTotals.totalLineDiscounts > 0 && (
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Line Items Discount</span>
                    <span className="font-semibold text-emerald-600">-{formatINR(liveTotals.totalLineDiscounts)}</span>
                  </div>
                )}

                {liveTotals.invoiceDiscount > 0 && (
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Invoice Discount ({editDiscountType === "PERCENTAGE" ? `${editDiscountValue}%` : "Fixed"})</span>
                    <span className="font-semibold text-emerald-600">-{formatINR(liveTotals.invoiceDiscount)}</span>
                  </div>
                )}

                {liveTotals.totalDiscount > 0 && (
                  <div className="flex justify-between items-center font-semibold text-emerald-700 dark:text-emerald-400 pt-1 border-t">
                    <span>Total Discount Applied</span>
                    <span>-{formatINR(liveTotals.totalDiscount)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center font-bold text-sm text-foreground pt-1.5 border-t">
                  <span>Net Payable Amount</span>
                  <span className="text-base text-primary">{formatINR(liveTotals.totalAmount)}</span>
                </div>

                <div className="flex justify-between items-center text-xs text-muted-foreground pt-1">
                  <span>Amount Already Paid</span>
                  <span className="font-semibold text-emerald-600">{formatINR(liveTotals.amountPaid)}</span>
                </div>

                <div className="flex justify-between items-center font-bold text-sm text-amber-600 pt-1">
                  <span>Balance Due</span>
                  <span>{formatINR(liveTotals.amountDue)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPricingDialogOpen(false)}
              disabled={pricingMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => pricingMutation.mutate(false)}
              disabled={pricingMutation.isPending}
            >
              {pricingMutation.isPending ? "Saving..." : "Save Draft"}
            </Button>
            <Button
              type="button"
              onClick={() => pricingMutation.mutate(true)}
              disabled={pricingMutation.isPending || liveTotals.hasMissingPrices}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {pricingMutation.isPending ? "Finalizing..." : "Finalize & Issue Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                {activeInvoice?.patient?.first_name} {activeInvoice?.patient?.last_name || ""}
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
                    {formatINR(activeInvoice.total_amount)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Outstanding Due
                  </span>
                  <span className="font-bold text-sm text-amber-600">
                    {formatINR(activeInvoice.amount_due)}
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
                    {detailedInvoice.patient?.first_name} {detailedInvoice.patient?.last_name || ""}
                  </span>
                  <span className="text-muted-foreground">
                    Patient #{detailedInvoice.patient?.patient_number || "—"}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-bold ${
                    detailedInvoice.status === "PAID"
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-300"
                      : detailedInvoice.status === "PARTIALLY_PAID"
                      ? "bg-amber-500/10 text-amber-700 border-amber-300"
                      : detailedInvoice.status === "DRAFT"
                      ? "bg-amber-500/10 text-amber-800 border-amber-400"
                      : "bg-blue-500/10 text-blue-700 border-blue-300"
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
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detailedInvoice.items.map((item, idx) => {
                      const isUnpriced =
                        item.unit_price <= 0 &&
                        (item.description.toLowerCase().startsWith("rx:") ||
                          item.description.toLowerCase().includes("medicine"));
                      return (
                        <tr key={idx} className={isUnpriced ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                          <td className="py-2.5 px-3 font-medium text-foreground flex items-center gap-2">
                            <span>{item.description}</span>
                            {isUnpriced && (
                              <Badge
                                variant="outline"
                                className="text-[9px] border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                              >
                                Price needed
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center text-muted-foreground">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">
                            {isUnpriced ? (
                              <span className="text-amber-600 font-medium">₹0</span>
                            ) : (
                              formatINR(item.unit_price)
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                            {formatINR(item.total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 font-bold">
                    <tr>
                      <td colSpan={3} className="py-2 px-3 text-muted-foreground font-normal">
                        Subtotal
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatINR(detailedInvoice.subtotal)}
                      </td>
                    </tr>
                    {detailedInvoice.discount > 0 && (
                      <tr>
                        <td colSpan={3} className="py-2 px-3 text-emerald-600 font-normal">
                          Discount Applied
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-600">
                          -{formatINR(detailedInvoice.discount)}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t">
                      <td colSpan={3} className="py-2.5 px-3 text-foreground">
                        Total Amount
                      </td>
                      <td className="py-2.5 px-3 text-right text-sm text-primary font-bold">
                        {formatINR(detailedInvoice.total_amount)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="py-2 px-3 text-muted-foreground font-normal">
                        Amount Paid
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-600 font-semibold">
                        {formatINR(detailedInvoice.amount_paid)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="py-2 px-3 text-muted-foreground font-normal">
                        Balance Remaining
                      </td>
                      <td className="py-2 px-3 text-right text-amber-600 font-bold">
                        {formatINR(detailedInvoice.amount_due)}
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
                            {formatINR(p.amount)} via {p.payment_method}
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

          <DialogFooter className="flex justify-between sm:justify-between items-center">
            {detailedInvoice && detailedInvoice.status !== "PAID" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 text-primary border-primary/30 hover:border-primary text-xs"
                onClick={() => {
                  setDetailsDialogOpen(false);
                  openPricingDialog(detailedInvoice);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Pricing &amp; Discounts
              </Button>
            ) : <div />}

            <Button type="button" onClick={() => setDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
