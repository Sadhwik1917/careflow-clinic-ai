import { useState, useId } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Camera, Check, Copy, Download, Printer, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { MotionDialogContent, DialogTitle, DialogDescription } from "./motion-primitives";
import { PatientQrScanner } from "./patient-qr-scanner";
import { generateQrSvg } from "@/lib/qr";
import { createPatientRegistrationUrl, isValidClinicUuid } from "@/lib/qr-payload";
import { toast } from "@/lib/toast";

export function PatientQrDialog({
  clinicId,
  onScanSuccess,
}: {
  clinicId?: string;
  onScanSuccess?: ((clinicId: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"display" | "scan">("display");
  const [copied, setCopied] = useState(false);
  const titleId = useId();
  const navigate = useNavigate();

  const origin = typeof window !== "undefined" ? window.location.origin : "https://careflow-clinic.internal";
  const registrationUrl =
    clinicId && isValidClinicUuid(clinicId)
      ? createPatientRegistrationUrl(origin, clinicId)
      : `${origin}/clinic/patients/new`;
  const svgMarkup = generateQrSvg(registrationUrl, { size: 280, margin: 4 });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopied(true);
      toast.success("Patient registration link copied to clipboard");
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

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Please allow popups to print the QR code");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Patient Registration QR Code - CAREFLOW AI</title>
          <style>
            body {
              font-family: system-ui, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 24px;
              color: #0f172a;
              text-align: center;
            }
            .card {
              border: 2px solid #cbd5e1;
              border-radius: 16px;
              padding: 40px;
              max-width: 400px;
            }
            h1 { font-size: 20px; margin: 0 0 8px 0; }
            p { font-size: 14px; color: #475569; margin: 0 0 24px 0; }
            .qr-wrap { display: flex; justify-content: center; margin-bottom: 24px; }
            .footer { font-size: 11px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Patient Registration</h1>
            <p>Scan this code with your phone camera to register</p>
            <div class="qr-wrap">${svgMarkup}</div>
            <div class="footer">CAREFLOW AI Clinic Operations</div>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <QrCode className="size-4" />
          Register with QR Code
        </Button>
      </DialogTrigger>
      <MotionDialogContent className="max-w-md">
        <DialogTitle id={titleId}>Patient Registration QR</DialogTitle>
        <DialogDescription>
          Display the clinic QR code for desk registration, or scan a patient registration code using your camera.
        </DialogDescription>

        {/* Mode Switcher */}
        <div className="mt-3 flex border-b border-border">
          <button
            type="button"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "display"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("display")}
          >
            <QrCode className="size-3.5" />
            Display QR Code
          </button>
          <button
            type="button"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "scan"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("scan")}
          >
            <Camera className="size-3.5" />
            Scan QR Code
          </button>
        </div>

        {activeTab === "display" ? (
          <>
            <div className="mt-4 flex flex-col items-center justify-center rounded-xl border bg-white p-6 shadow-sm">
              <div
                className="size-64 overflow-hidden rounded-lg flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
                role="img"
                aria-label="Patient registration QR code"
              />
              <p className="mt-4 text-center text-xs font-medium text-slate-600">
                Scan this code with any phone camera to open registration.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5 text-xs">
                {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy link"}
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadSvg} className="gap-1.5 text-xs">
                  <Download className="size-3.5" />
                  Download SVG
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
                  <Printer className="size-3.5" />
                  Print
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <PatientQrScanner
              clinicId={clinicId}
              isActive={open && activeTab === "scan"}
              onSuccess={result => {
                toast.success("Clinic registration verified");
                setOpen(false);
                if (onScanSuccess) {
                  onScanSuccess(result.clinicId);
                } else {
                  void navigate({
                    to: "/clinic/patients/new",
                    search: { clinic: result.clinicId },
                  });
                }
              }}
              onCancel={() => setOpen(false)}
            />
          </div>
        )}
      </MotionDialogContent>
    </Dialog>
  );
}
