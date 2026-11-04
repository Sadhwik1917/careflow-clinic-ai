import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/careflow/auth-ui";
import { PageTitle } from "@/components/careflow/page-title";
import { publicMeta } from "@/lib/public-meta";

export const Route = createFileRoute("/terms")({
  head: () =>
    publicMeta(
      "Terms of Service",
      "CAREFLOW AI Terms of Service — service terms, clinic responsibilities, acceptable use, and account rules for our clinic operations platform.",
      "/terms"
    ),
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  return (
    <PublicLayout>
      <article className="max-w-3xl space-y-8">
        <PageTitle
          title="Terms of Service"
          description="Last updated: October 26, 2026"
        />

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            1. Acceptance of Terms
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            By accessing or using CAREFLOW AI (&quot;the Platform&quot;), whether as a clinic owner,
            healthcare provider, staff member, or patient, you agree to be bound by these Terms of
            Service. If you do not agree to these terms, you must not use the Platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            2. Platform Description & Clinical Disclaimer
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            CAREFLOW AI is an administrative clinic operations and patient management SaaS
            application providing appointment scheduling, patient queue coordination, digital
            encounter recording, billing workflows, and operational communication tools.
          </p>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">
              Clinical Responsibility & Medical Disclaimer:
            </strong>{" "}
            CAREFLOW AI is not a healthcare provider, does not practice medicine, and does not
            provide emergency medical services. Any AI-assisted drafting, summarizing, or
            administrative aids are provided solely to support practice efficiency. Licensed
            medical professionals retain independent clinical judgment and sole responsibility
            for all patient diagnosis, treatment plans, prescriptions, and healthcare decisions.
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            3. Account Responsibilities & Role-Based Access
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Users must maintain the confidentiality of their credentials and immediately notify
            their clinic administrator or support if unauthorized account access is suspected.
            Accounts and invitations are non-transferable:
          </p>
          <ul className="list-inside list-disc space-y-1.5 text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">Clinic Owners:</strong> Responsible
              for clinic verification details, subscription payments, authorizing staff members,
              and configuring practice operational settings.
            </li>
            <li>
              <strong className="font-medium text-foreground">Healthcare Providers:</strong>{" "}
              Responsible for maintaining appropriate medical licensure and ensuring the accuracy
              of consultation notes and prescriptions entered on the Platform.
            </li>
            <li>
              <strong className="font-medium text-foreground">Clinic Staff:</strong> Responsible for
              accurate intake, queue management, and patient communication.
            </li>
            <li>
              <strong className="font-medium text-foreground">Patients:</strong> Responsible for
              providing accurate personal contact and appointment details.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            4. Third-Party Integrations & Communication
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Clinic owners may integrate authorized third-party services, such as connecting a clinic
            Google account via OAuth 2.0 to deliver clinic invitations from their own registered
            address. You represent and warrant that you hold the legal authority to connect such
            accounts on behalf of your clinic practice and that third-party integrations comply with
            applicable terms and data policies.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            5. Acceptable Use
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            You agree not to misuse the Platform, including but not limited to:
          </p>
          <ul className="list-inside list-disc space-y-1.5 text-muted-foreground">
            <li>Attempting unauthorized access to other clinics&apos; records or data partitions.</li>
            <li>Transmitting unsolicited marketing or spam communications through connected email services.</li>
            <li>Introducing viruses, malicious software, or interfering with system availability.</li>
            <li>Impersonating another medical practice, healthcare professional, or patient.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            6. Subscriptions, Billing & Cancellations
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Clinic operations subscriptions are billed according to published plan terms. Clinic
            owners may manage or cancel subscriptions through their account management dashboard.
            Access to operational features continues through the end of the paid billing period.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            7. Modifications & Inquiries
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            We reserve the right to modify these Terms to reflect operational or regulatory
            updates. Continued use of the Platform after changes are posted constitutes acceptance
            of updated terms. For questions regarding these Terms, please contact us through our{" "}
            <a href="/contact" className="underline hover:text-foreground">
              Contact Page
            </a>
            .
          </p>
        </section>
      </article>
    </PublicLayout>
  );
}
