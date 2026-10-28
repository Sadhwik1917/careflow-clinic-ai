import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { PatientForm } from "@/components/careflow/patient-form";
import { PageTitle } from "@/components/careflow/page-title";
import { PatientQrDialog } from "@/components/careflow/patient-qr-dialog";
import { PatientQrScanner } from "@/components/careflow/patient-qr-scanner";
import { registerClinicPatient } from "@/lib/patients.functions";
import { patientQuery } from "@/lib/patient-queries";
import { pageMetadata } from "@/lib/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { generateQrSvg } from "@/lib/qr";
import { createPatientRegistrationUrl } from "@/lib/qr-payload";
import { Camera, Check, Copy, Download, QrCode, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clinic/patients/new")({
  head: () => pageMetadata("New patient", "OWNER"),
  component: Page,
});

function Page() {
  const { user, membership } = Route.useRouteContext();
  const clinicId = membership?.clinic_id ?? "";
  const register = useServerFn(registerClinicPatient);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"form" | "qr">("form");
  const [qrSubTab, setQrSubTab] = useState<"display" | "scan">("display");
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://careflow-clinic.internal";
  const registrationUrl = clinicId
    ? createPatientRegistrationUrl(origin, clinicId)
    : `${origin}/clinic/patients/new`;
  const svgMarkup = generateQrSvg(registrationUrl, { size: 240, margin: 4 });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopied(true);
      toast.success("Registration URL copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const downloadSvg = () => {
    try {
      const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `patient-registration-qr-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("QR Code downloaded as SVG");
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <>
      <PageTitle
        title="Register patient"
        description="Add a new patient to your clinic directory or allow desk/mobile registration via QR code."
        actions={
          <div className="flex items-center gap-2">
            <PatientQrDialog clinicId={clinicId} />
          </div>
        }
      />

      <div className="border-t py-6 space-y-6">
        <div className="flex border-b border-border">
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "form"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("form")}
          >
            <UserPlus className="size-4" />
            Standard registration
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "qr"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("qr")}
          >
            <QrCode className="size-4" />
            Register with QR Code
          </button>
        </div>

        {activeTab === "form" ? (
          <PatientForm
            onCancel={() => void navigate({ to: "/clinic/patients", search: { search: "", page: 0 } })}
            onSave={async fields => {
              try {
                const p = await register({ data: { clinicId, fields } });
                qc.setQueryData(patientQuery(user.id, clinicId, p.id).queryKey, p);
                await qc.invalidateQueries({ queryKey: ["patients", user.id, clinicId] });
                toast.success({
                  title: "Patient registered",
                  description: `${p.first_name} ${p.last_name} (${p.patient_number}) registered successfully.`,
                });
                await navigate({
                  to: "/clinic/patients/$patientId",
                  params: { patientId: p.id },
                  search: { registered: true },
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Patient wasn't registered. Please try again.";
                toast.error(msg);
                throw err;
              }
            }}
          />
        ) : (
          <div className="max-w-md mx-auto space-y-6 text-center">
            {/* Sub-tab selection: Display vs Scan */}
            <div className="flex justify-center border-b border-border">
              <button
                type="button"
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  qrSubTab === "display"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setQrSubTab("display")}
              >
                <QrCode className="size-3.5" />
                Display QR code
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  qrSubTab === "scan"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setQrSubTab("scan")}
              >
                <Camera className="size-3.5" />
                Scan with camera
              </button>
            </div>

            {qrSubTab === "display" ? (
              <>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-foreground">Scan with phone camera</h2>
                  <p className="text-xs text-muted-foreground">
                    Display this QR code at reception or print it for patients to self-register.
                  </p>
                </div>

                <div className="flex flex-col items-center justify-center rounded-xl border bg-white p-6 shadow-sm">
                  <div
                    className="size-60 overflow-hidden rounded-lg flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                    role="img"
                    aria-label="Patient registration QR code"
                  />
                  <p className="mt-4 text-xs font-medium text-slate-600">
                    Scan this code with any phone camera to open patient registration.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5 text-xs">
                    {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied link" : "Copy URL"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadSvg} className="gap-1.5 text-xs">
                    <Download className="size-3.5" />
                    Download SVG
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-foreground">Scan patient QR code</h2>
                  <p className="text-xs text-muted-foreground">
                    Point your camera at a patient registration QR code or enter the payload manually.
                  </p>
                </div>

                <PatientQrScanner
                  clinicId={clinicId}
                  isActive={activeTab === "qr" && qrSubTab === "scan"}
                  onSuccess={() => {
                    toast.success("Clinic registration verified! Ready for patient details.");
                    setActiveTab("form");
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
