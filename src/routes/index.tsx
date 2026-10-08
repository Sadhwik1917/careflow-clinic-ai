import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, ClipboardList, ListOrdered, Receipt } from "lucide-react";
import { AuthActions, PublicLayout } from "@/components/careflow/auth-ui";
import { Button } from "@/components/ui/button";
import { publicMeta } from "@/lib/public-meta";

export const Route = createFileRoute("/")({
  head: () => publicMeta("Clinic management for modern practices", "CAREFLOW AI brings patients, appointments, queues, consultations and billing together in one calm clinic workspace."),
  component: Index,
});

const features = [
  { icon: CalendarDays, title: "Appointments", text: "Schedule and track visits across your doctors." },
  { icon: ListOrdered, title: "Patient queue", text: "Check patients in and keep the waiting room moving." },
  { icon: ClipboardList, title: "Consultations", text: "Record consultations and prescriptions in one place." },
  { icon: Receipt, title: "Billing", text: "Create invoices and record payments for each visit." },
];

function Index() {
  return <PublicLayout>
    <section className="max-w-2xl">
      <h1 className="text-4xl font-semibold leading-tight md:text-5xl">A calm, connected workspace for your clinic.</h1>
      <p className="mt-5 text-lg leading-relaxed text-muted-foreground">CAREFLOW AI brings patients, appointments, queues, consultations and billing together for clinic owners, doctors, staff and patients.</p>
      <div className="mt-8 flex flex-wrap gap-3"><AuthActions size="lg" /></div>
    </section>
    <section aria-label="Features" className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {features.map(f => <div key={f.title} className="rounded-lg border bg-card p-5"><span className="flex size-10 items-center justify-center rounded-md bg-secondary text-primary"><f.icon className="size-5" strokeWidth={1.6} /></span><h2 className="mt-4 font-semibold">{f.title}</h2><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.text}</p></div>)}
    </section>
  </PublicLayout>;
}
