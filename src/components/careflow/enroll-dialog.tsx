import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/careflow/feedback";

export type PlanDetails = { scopeText: string; ai: string; features: string[]; price: string; trial: string | null };
export type EnrollPlan = { name: string; flexible: boolean; trialAvailable: boolean; describe: (scope: "SINGLE" | "MULTI") => PlanDetails };

// Restrained enter/exit: fade + slight lift/scale; disabled under prefers-reduced-motion.
const overlayCls =
  "fixed inset-0 z-50 bg-foreground/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200 motion-reduce:animate-none";
const contentCls =
  "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border bg-card p-6 shadow-lg ease-out duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:zoom-out-[0.98] data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-2 motion-reduce:animate-none";

const trialEndText = () => new Date(Date.now() + 21 * 86_400_000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function EnrollDialog({
  plan,
  busy,
  error,
  onCancel,
  onConfirm,
  onStartTrial,
}: {
  plan: EnrollPlan | null;
  busy: "trial" | "paid" | null;
  error: string | null;
  onCancel: () => void;
  onConfirm: (scope: "SINGLE" | "MULTI") => void;
  onStartTrial: (scope: "SINGLE" | "MULTI") => void;
}) {
  const [scope, setScope] = useState<"SINGLE" | "MULTI">("SINGLE");
  const [consent, setConsent] = useState(false);
  const [shown, setShown] = useState<EnrollPlan | null>(plan);
  // Keep the last plan rendered during the exit animation.
  useEffect(() => {
    if (plan) {
      setShown(plan);
      setScope("SINGLE");
      setConsent(false);
    }
  }, [plan]);
  const d = shown?.describe(scope);
  return (
    <DialogPrimitive.Root
      open={!!plan}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayCls} />
        <DialogPrimitive.Content
          className={contentCls}
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          {shown && d && (
            <>
              <DialogPrimitive.Title className="text-lg font-semibold">Confirm Enrollment</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Plan details for {shown.name}</DialogPrimitive.Description>
              <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
                <div>
                  <p className="font-medium">{shown.name}</p>
                  <p className="text-xl font-semibold">
                    {d.price} <span className="text-sm font-normal text-muted-foreground">/ month</span>
                  </p>
                  {d.trial && shown.trialAvailable && (
                    <div className="mt-1">
                      <StatusBadge tone="info">{d.trial}</StatusBadge>
                    </div>
                  )}
                </div>
                {shown.flexible && (
                  <div
                    role="radiogroup"
                    aria-label="Clinic scope"
                    className="grid grid-cols-2 gap-1 rounded-md border p-1 text-sm"
                  >
                    {(["SINGLE", "MULTI"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={scope === s}
                        disabled={!!busy}
                        onClick={() => setScope(s)}
                        className={`rounded px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        {s === "SINGLE" ? "Single clinic" : "Multi-clinic"}
                      </button>
                    ))}
                  </div>
                )}
                <dl className="space-y-1 text-sm">
                  <div>
                    <dt className="inline text-muted-foreground">Clinic scope: </dt>
                    <dd className="inline font-medium">{d.scopeText}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">AI allowance: </dt>
                    <dd className="inline font-medium">{d.ai}</dd>
                  </div>
                </dl>
                <ul className="space-y-1 text-sm">
                  {d.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                {d.trial && shown.trialAvailable && (
                  <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
                    <p className="font-medium text-sm">Free trial with automatic renewal</p>
                    <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                      <li>{d.trial}. No subscription fee is charged today.</li>
                      <li>You'll authorize a recurring payment (card or UPI AutoPay) in Razorpay. Razorpay may take a small authorization amount, shown in checkout before you approve; it is refunded.</li>
                      <li>First charge: {d.price} on {trialEndText()} — exactly 21 days after you start — then {d.price} every month until you cancel.</li>
                      <li>Cancel any time up to 1 hour before {trialEndText()} using “Cancel Free Trial” and you won't be charged. Cancelling ends clinic access immediately; a trial can be used once per clinic and account.</li>
                    </ul>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={consent} disabled={!!busy} onChange={(e) => setConsent(e.target.checked)} />
                      <span>I agree to be charged {d.price}/month automatically starting {trialEndText()} unless I cancel before then.</span>
                    </label>
                  </div>
                )}
                {error && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" disabled={!!busy} onClick={onCancel}>
                  Cancel
                </Button>
                {shown.trialAvailable && (
                  <Button type="button" variant="secondary" disabled={!!busy || !consent} onClick={() => onStartTrial(scope)}>
                    {busy === "trial" ? <><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Opening authorization…</> : "Start Free Trial"}
                  </Button>
                )}
                <Button type="button" disabled={!!busy} onClick={() => onConfirm(scope)}>
                  {busy === "paid" ? <><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Preparing checkout…</> : "Confirm Full Plan"}
                </Button>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
