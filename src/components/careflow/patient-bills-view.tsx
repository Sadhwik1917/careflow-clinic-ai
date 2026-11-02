import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Receipt,
  CreditCard,
  Search,
  Filter,
  FileText,
  Printer,
  Eye,
  Building2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Phone,
  HelpCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { PageTitle } from "@/components/careflow/page-title";
import { StatisticsCard } from "@/components/careflow/statistics-card";
import { StatusBadge, EmptyState, LoadingState } from "@/components/careflow/feedback";
import {
  patientInvoicesQuery,
  patientPaymentsQuery,
} from "@/lib/clinical-queries";
import type { InvoiceWithDetails, PatientPaymentWithDetails } from "@/lib/clinical";
import { formatINR } from "@/lib/billing-calculations";
import { PatientInvoiceReceiptDialog } from "./patient-invoice-receipt-dialog";

interface PatientBillsViewProps {
  userId?: string | undefined;
  clinicId?: string | undefined;
}

export function PatientBillsView({ clinicId }: PatientBillsViewProps) {
  const [search, setSearch] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [activeTab, setActiveTab] = React.useState<string>("invoices");

  // Dialog states
  const [breakdownInvoice, setBreakdownInvoice] = React.useState<InvoiceWithDetails | null>(null);
  const [breakdownOpen, setBreakdownOpen] = React.useState<boolean>(false);

  const [receiptInvoice, setReceiptInvoice] = React.useState<InvoiceWithDetails | null>(null);
  const [receiptOpen, setReceiptOpen] = React.useState<boolean>(false);

  // Queries using established query patterns
  const {
    data: invoices = [],
    isLoading: loadingInvoices,
    isError: errorInvoices,
    refetch: refetchInvoices,
  } = useQuery({
    ...patientInvoicesQuery(clinicId),
  });

  const {
    data: payments = [],
    isLoading: loadingPayments,
    isError: errorPayments,
    refetch: refetchPayments,
  } = useQuery({
    ...patientPaymentsQuery(clinicId),
  });

  // Derived financial metrics
  const metrics = React.useMemo(() => {
    let totalBilled = 0;
    let totalCollected = 0;
    let totalDue = 0;
    let paidCount = 0;
    let openCount = 0;

    for (const inv of invoices) {
      totalBilled += Number(inv.total_amount) || 0;
      totalCollected += Number(inv.amount_paid) || 0;
      totalDue += Number(inv.amount_due) || 0;
      if (inv.status === "PAID") {
        paidCount++;
      } else if (inv.status !== "CANCELLED" && Number(inv.amount_due) > 0) {
        openCount++;
      }
    }

    return {
      totalBilled,
      totalCollected,
      totalDue,
      invoiceCount: invoices.length,
      paidCount,
      openCount,
    };
  }, [invoices]);

  // Filtered invoices
  const filteredInvoices = React.useMemo(() => {
    return invoices.filter((inv) => {
      // Status filter
      if (statusFilter === "UNPAID") {
        if (inv.status === "PAID" || inv.status === "CANCELLED" || Number(inv.amount_due) <= 0) {
          return false;
        }
      } else if (statusFilter !== "ALL") {
        if (inv.status !== statusFilter) return false;
      }

      // Search query
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const num = (inv.invoice_number || "").toLowerCase();
      const clinicName = (inv.clinic?.name || "").toLowerCase();
      const patientName = `${inv.patient?.first_name || ""} ${inv.patient?.last_name || ""}`.toLowerCase();
      const itemMatch = (inv.items || []).some((it) => it.description.toLowerCase().includes(q));

      return num.includes(q) || clinicName.includes(q) || patientName.includes(q) || itemMatch;
    });
  }, [invoices, statusFilter, search]);

  // Filtered payments
  const filteredPayments = React.useMemo(() => {
    return payments.filter((p) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const ref = (p.transaction_reference || "").toLowerCase();
      const method = (p.payment_method || "").toLowerCase();
      const invNum = (p.invoice?.invoice_number || "").toLowerCase();
      const clinicName = (p.clinic?.name || "").toLowerCase();

      return ref.includes(q) || method.includes(q) || invNum.includes(q) || clinicName.includes(q);
    });
  }, [payments, search]);

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

  const getStatusTone = (status: string) => {
    switch (status) {
      case "PAID":
        return "success";
      case "PARTIALLY_PAID":
        return "warning";
      case "ISSUED":
        return "info";
      case "CANCELLED":
        return "danger";
      case "DRAFT":
      default:
        return "neutral";
    }
  };

  const handleOpenBreakdown = (inv: InvoiceWithDetails) => {
    setBreakdownInvoice(inv);
    setBreakdownOpen(true);
  };

  const handleOpenReceipt = (inv: InvoiceWithDetails) => {
    setReceiptInvoice(inv);
    setReceiptOpen(true);
  };

  return (
    <div className="space-y-8">
      {/* Page Title & Actions */}
      <PageTitle
        title="Bills &amp; payment receipts"
        description="View your itemized clinical bills, official receipts, and payment transactions across your clinic visits."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchInvoices();
                refetchPayments();
              }}
              className="gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Financial Overview Statistics Cards */}
      <section aria-label="Billing overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticsCard
          label="Total invoiced"
          value={loadingInvoices ? null : formatINR(metrics.totalBilled)}
          detail={`${metrics.invoiceCount} total invoice${metrics.invoiceCount === 1 ? "" : "s"} on file`}
          icon={Receipt}
        />
        <StatisticsCard
          label="Total settled"
          value={loadingInvoices ? null : formatINR(metrics.totalCollected)}
          detail={`${metrics.paidCount} fully paid bill${metrics.paidCount === 1 ? "" : "s"}`}
          icon={CheckCircle2}
        />
        <StatisticsCard
          label="Outstanding balance"
          value={loadingInvoices ? null : formatINR(metrics.totalDue)}
          detail={
            metrics.openCount > 0
              ? `${metrics.openCount} bill${metrics.openCount === 1 ? "" : "s"} pending payment`
              : "All bills fully settled"
          }
          icon={CreditCard}
        />
        <StatisticsCard
          label="Payments recorded"
          value={loadingPayments ? null : payments.length}
          detail="Verified transaction receipts"
          icon={ShieldCheck}
        />
      </section>

      {/* Primary Tabs: Invoices vs Payment History */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <TabsList className="grid w-full sm:w-auto grid-cols-2">
            <TabsTrigger value="invoices" className="gap-2">
              <Receipt className="h-4 w-4" />
              Invoices &amp; Bills ({invoices.length})
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Payment History ({payments.length})
            </TabsTrigger>
          </TabsList>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={activeTab === "invoices" ? "Search bills, clinic..." : "Search ref, method..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {activeTab === "invoices" && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9 text-xs">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Bills</SelectItem>
                  <SelectItem value="UNPAID">Pending Due</SelectItem>
                  <SelectItem value="PAID">Paid in Full</SelectItem>
                  <SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
                  <SelectItem value="DRAFT">Draft Bills</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Tab 1: Invoices List */}
        <TabsContent value="invoices" className="space-y-4 m-0">
          {loadingInvoices ? (
            <LoadingState label="Loading your invoices &amp; bills…" />
          ) : errorInvoices ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
              <p className="text-sm font-medium text-destructive">
                Failed to load invoices. Please check your connection and retry.
              </p>
              <Button size="sm" variant="outline" onClick={() => refetchInvoices()}>
                Retry
              </Button>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <EmptyState
              title={invoices.length === 0 ? "No bills on record" : "No matching invoices found"}
              description={
                invoices.length === 0
                  ? "When your doctor or clinic team issues an invoice for your visits or medication, it will appear here."
                  : "Try adjusting your search query or status filter."
              }
              icon={Receipt}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredInvoices.map((inv) => {
                const clinicName = inv.clinic?.name || "CareFlow Medical Clinic";
                const issueDate = formatDate(inv.issued_at || inv.created_at);
                const isPaid = inv.status === "PAID";
                const hasBalance = Number(inv.amount_due) > 0;

                return (
                  <Card key={inv.id} className="overflow-hidden border shadow-sm transition-all hover:border-primary/40">
                    <CardHeader className="bg-muted/20 border-b pb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-bold text-base text-foreground flex items-center gap-1.5">
                              <Receipt className="h-4 w-4 text-primary" />
                              #{inv.invoice_number}
                            </span>
                            <StatusBadge tone={getStatusTone(inv.status)}>
                              {inv.status}
                            </StatusBadge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" />
                              {clinicName}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              Issued: {issueDate}
                            </span>
                          </div>
                        </div>

                        {/* Financial Snapshot */}
                        <div className="flex items-center sm:text-right gap-4">
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                              Total Billed
                            </span>
                            <span className="text-base font-bold text-foreground">
                              {formatINR(Number(inv.total_amount) || 0)}
                            </span>
                          </div>
                          {hasBalance && (
                            <div className="border-l pl-4">
                              <span className="text-[10px] text-amber-600 uppercase font-semibold block">
                                Balance Due
                              </span>
                              <span className="text-base font-bold text-amber-600">
                                {formatINR(Number(inv.amount_due) || 0)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-4 space-y-4">
                      {/* Line Item Preview Summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="rounded-md border p-2.5 bg-muted/10 space-y-1">
                          <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                            Billed Services &amp; Items
                          </span>
                          <p className="font-medium text-foreground">
                            {inv.items && inv.items.length > 0
                              ? `${inv.items.length} item${inv.items.length === 1 ? "" : "s"} (${inv.items[0]?.description}${inv.items.length > 1 ? ` +${inv.items.length - 1} more` : ""})`
                              : "Consultation encounter"}
                          </p>
                        </div>
                        <div className="rounded-md border p-2.5 bg-muted/10 space-y-1">
                          <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                            Due Date &amp; Terms
                          </span>
                          <p className="font-medium text-foreground">
                            {isPaid ? "Settled in full" : "Due upon receipt"}
                          </p>
                        </div>
                        <div className="rounded-md border p-2.5 bg-muted/10 space-y-1">
                          <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                            Payment Status
                          </span>
                          <p className="font-medium text-foreground">
                            {isPaid
                              ? `Fully paid (${formatINR(Number(inv.amount_paid))})`
                              : Number(inv.amount_paid) > 0
                                ? `Paid ${formatINR(Number(inv.amount_paid))} of ${formatINR(Number(inv.total_amount))}`
                                : "Unpaid — pending settlement"}
                          </p>
                        </div>
                      </div>

                      {/* Payment Notice for Outstanding Bills */}
                      {hasBalance && (
                        <div className="flex items-start gap-2.5 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold">
                              Outstanding Balance: {formatINR(Number(inv.amount_due))}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Please settle this balance at the clinic reception via UPI, Credit/Debit Card, or Cash.
                              {inv.clinic?.phone && ` For billing queries, call ${inv.clinic.phone}.`}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t">
                        <div className="text-[11px] text-muted-foreground">
                          {inv.payments && inv.payments.length > 0 ? (
                            <span className="text-emerald-600 font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {inv.payments.length} payment transaction{inv.payments.length === 1 ? "" : "s"} recorded
                            </span>
                          ) : (
                            <span>No payment transactions logged yet</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenBreakdown(inv)}
                            className="gap-1.5 text-xs h-8"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View Breakdown
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleOpenReceipt(inv)}
                            className="gap-1.5 text-xs h-8"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Official Receipt
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Payment Transactions History */}
        <TabsContent value="payments" className="space-y-4 m-0">
          {loadingPayments ? (
            <LoadingState label="Loading payment history…" />
          ) : errorPayments ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
              <p className="text-sm font-medium text-destructive">
                Failed to load payments. Please check your connection and retry.
              </p>
              <Button size="sm" variant="outline" onClick={() => refetchPayments()}>
                Retry
              </Button>
            </div>
          ) : filteredPayments.length === 0 ? (
            <EmptyState
              title={payments.length === 0 ? "No payment transactions yet" : "No matching payments"}
              description={
                payments.length === 0
                  ? "When payments are recorded for your clinic invoices, receipt records will be displayed here."
                  : "Try clearing your search query."
              }
              icon={CreditCard}
            />
          ) : (
            <Card className="overflow-hidden border shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 border-b text-[11px] font-semibold text-muted-foreground uppercase">
                    <tr>
                      <th className="py-3 px-4">Date &amp; Time</th>
                      <th className="py-3 px-4">Receipt / Ref</th>
                      <th className="py-3 px-4">Invoice</th>
                      <th className="py-3 px-4">Clinic</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredPayments.map((p) => {
                      const pDate = p.paid_at || p.created_at;
                      return (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="py-3 px-4 text-foreground font-medium">
                            {formatDate(pDate)}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                            {p.transaction_reference || `REC-${p.id.slice(0, 8).toUpperCase()}`}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-foreground">
                            {p.invoice?.invoice_number ? `#${p.invoice.invoice_number}` : "—"}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {p.clinic?.name || "CareFlow Medical Clinic"}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="text-[10px] font-semibold">
                              {p.payment_method}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-600">
                            {formatINR(Number(p.amount) || 0)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <StatusBadge tone={p.status === "SUCCESS" ? "success" : "neutral"}>
                              {p.status}
                            </StatusBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Itemized Bill Breakdown Dialog */}
      <Dialog open={breakdownOpen} onOpenChange={setBreakdownOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-5 w-5 text-primary" />
              Invoice Breakdown #{breakdownInvoice?.invoice_number}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Itemized charges for consultations, procedures, and prescribed medications.
            </DialogDescription>
          </DialogHeader>

          {breakdownInvoice && (
            <div className="space-y-4 py-2 text-xs">
              {/* Header Box */}
              <div className="p-3 rounded-lg border bg-muted/30 flex justify-between items-center">
                <div>
                  <span className="font-semibold text-foreground text-sm block">
                    {breakdownInvoice.clinic?.name || "CareFlow Medical Clinic"}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    Issued: {formatDate(breakdownInvoice.issued_at || breakdownInvoice.created_at)}
                  </span>
                </div>
                <StatusBadge tone={getStatusTone(breakdownInvoice.status)}>
                  {breakdownInvoice.status}
                </StatusBadge>
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Billable Items
                </span>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-muted/60 border-b text-[10px] font-semibold text-muted-foreground uppercase">
                      <tr>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3 text-center w-12">Qty</th>
                        <th className="py-2 px-3 text-right w-20">Price</th>
                        <th className="py-2 px-3 text-right w-20">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {breakdownInvoice.items && breakdownInvoice.items.length > 0 ? (
                        breakdownInvoice.items.map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td className="py-2 px-3 font-medium text-foreground">{it.description}</td>
                            <td className="py-2 px-3 text-center text-muted-foreground">{it.quantity}</td>
                            <td className="py-2 px-3 text-right text-muted-foreground">
                              {formatINR(Number(it.unit_price) || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-foreground">
                              {formatINR(Number(it.total) || 0)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-3 text-center text-muted-foreground">
                            Standard consultation fee
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="space-y-1.5 p-3 rounded-lg bg-muted/20 border">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatINR(Number(breakdownInvoice.subtotal) || 0)}</span>
                </div>
                {Number(breakdownInvoice.discount) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span>- {formatINR(Number(breakdownInvoice.discount))}</span>
                  </div>
                )}
                {Number(breakdownInvoice.tax) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span>{formatINR(Number(breakdownInvoice.tax))}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-foreground text-sm pt-0.5">
                  <span>Total Amount</span>
                  <span>{formatINR(Number(breakdownInvoice.total_amount) || 0)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Amount Paid</span>
                  <span className="font-semibold text-emerald-600">
                    {formatINR(Number(breakdownInvoice.amount_paid) || 0)}
                  </span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1">
                  <span className={Number(breakdownInvoice.amount_due) > 0 ? "text-amber-600" : "text-muted-foreground"}>
                    Balance Outstanding
                  </span>
                  <span className={Number(breakdownInvoice.amount_due) > 0 ? "text-amber-600" : "text-muted-foreground"}>
                    {formatINR(Number(breakdownInvoice.amount_due) || 0)}
                  </span>
                </div>
              </div>

              {/* Associated Payments */}
              {breakdownInvoice.payments && breakdownInvoice.payments.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Recorded Payments
                  </span>
                  <div className="space-y-1">
                    {breakdownInvoice.payments.map((p) => (
                      <div key={p.id} className="flex justify-between items-center p-2 rounded bg-muted/40 border text-[11px]">
                        <div>
                          <span className="font-semibold text-foreground">{p.payment_method}</span>
                          {p.transaction_reference && (
                            <span className="text-muted-foreground ml-1.5">(Ref: {p.transaction_reference})</span>
                          )}
                          <span className="text-muted-foreground block text-[10px]">
                            {formatDate(p.paid_at || p.created_at)}
                          </span>
                        </div>
                        <span className="font-bold text-emerald-600">
                          {formatINR(Number(p.amount) || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex sm:justify-between items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setBreakdownOpen(false);
                if (breakdownInvoice) handleOpenReceipt(breakdownInvoice);
              }}
              className="gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Receipt
            </Button>
            <Button type="button" size="sm" onClick={() => setBreakdownOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Official Printable Receipt Modal */}
      <PatientInvoiceReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        invoice={receiptInvoice}
      />
    </div>
  );
}

