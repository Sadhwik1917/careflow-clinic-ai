import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, CheckCircle2, AlertCircle, RefreshCw, Keyboard, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validatePatientRegistrationPayload, type QrPayloadValidationResult } from "@/lib/qr-payload";
import { decodeQrFromImageData } from "@/lib/qr-decoder";

export interface PatientQrScannerProps {
  /** Optional active clinic ID to enforce clinic isolation */
  clinicId?: string | undefined;
  /** Callback invoked when a valid registration QR code or payload is confirmed */
  onSuccess: (result: { clinicId: string; registrationUrl: string }) => void;
  /** Optional cancel / dismiss callback */
  onCancel?: (() => void) | undefined;
  /** Whether the scanner is currently active/visible */
  isActive?: boolean | undefined;
}

type ScannerState =
  | "idle"
  | "requesting_permission"
  | "scanning"
  | "success"
  | "permission_denied"
  | "unsupported"
  | "error";

export function PatientQrScanner({
  clinicId,
  onSuccess,
  onCancel,
  isActive = true,
}: PatientQrScannerProps) {
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [manualInput, setManualInput] = useState<string>("");
  const [manualError, setManualError] = useState<string>("");
  const [detectedClinicId, setDetectedClinicId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const hasTriggeredSuccessRef = useRef<boolean>(false);

  // Stop camera stream safely
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // ignore cleanup errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Process detected raw QR payload
  const handleScannedPayload = useCallback(
    (rawPayload: string) => {
      if (isProcessingRef.current || hasTriggeredSuccessRef.current) return;
      isProcessingRef.current = true;

      const validation: QrPayloadValidationResult = validatePatientRegistrationPayload(
        rawPayload,
        clinicId
      );

      if (validation.success) {
        hasTriggeredSuccessRef.current = true;
        setDetectedClinicId(validation.clinicId);
        setScannerState("success");
        setStatusMessage("QR Code verified! Redirecting to registration…");
        stopCamera();

        // Brief delay for visual confirmation of scan before callback
        setTimeout(() => {
          onSuccess({
            clinicId: validation.clinicId,
            registrationUrl: validation.registrationUrl,
          });
        }, 600);
      } else {
        setStatusMessage(validation.error);
        // Cooldown for 2.5 seconds before allowing next scan attempt
        setTimeout(() => {
          isProcessingRef.current = false;
          setStatusMessage("");
        }, 2500);
      }
    },
    [clinicId, onSuccess, stopCamera]
  );

  // Start camera stream and detector loop
  const startCamera = useCallback(async () => {
    stopCamera();
    isProcessingRef.current = false;
    hasTriggeredSuccessRef.current = false;
    setScannerState("requesting_permission");
    setStatusMessage("Requesting camera access…");

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      setScannerState("unsupported");
      setStatusMessage("Camera access is not supported in this browser or environment.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
      }

      setScannerState("scanning");
      setStatusMessage("");

      // Initialize BarcodeDetector if available in browser
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasBarcodeDetector = typeof window !== "undefined" && "BarcodeDetector" in window;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = hasBarcodeDetector
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new (window as any).BarcodeDetector({ formats: ["qr_code"] })
        : null;

      // Scanning loop (every 200ms)
      scanIntervalRef.current = window.setInterval(async () => {
        if (isProcessingRef.current || hasTriggeredSuccessRef.current) return;
        const video = videoRef.current;
        if (!video || video.readyState < 2 || video.videoWidth === 0) return;

        try {
          if (detector) {
            const barcodes = await detector.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
              handleScannedPayload(barcodes[0].rawValue);
              return;
            }
          }

          // Fallback: capture canvas frame and run pure-TS QR decoder
          const canvas = canvasRef.current || document.createElement("canvas");
          canvas.width = Math.min(video.videoWidth, 480);
          canvas.height = Math.min(video.videoHeight, 360);
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const decoded = decodeQrFromImageData(imgData);
            if (decoded) {
              handleScannedPayload(decoded);
            }
          }
        } catch {
          // Frame decode error; continue loop
        }
      }, 200);
    } catch (err) {
      const errorName = err instanceof Error ? err.name : "";
      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
        setScannerState("permission_denied");
        setStatusMessage("Camera permission was denied. Please enable camera access in your browser or enter the code manually.");
      } else if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
        setScannerState("error");
        setStatusMessage("No camera device was found on this system.");
      } else if (errorName === "NotReadableError" || errorName === "TrackStartError") {
        setScannerState("error");
        setStatusMessage("Camera is already in use by another application.");
      } else {
        setScannerState("error");
        setStatusMessage("Unable to access camera. Please try again or use manual payload entry.");
      }
    }
  }, [handleScannedPayload, stopCamera]);

  // Lifecycle control
  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isActive, startCamera, stopCamera]);

  // Handle manual payload entry
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError("");

    if (!manualInput.trim()) {
      setManualError("Please enter a registration URL or clinic ID.");
      return;
    }

    const validation = validatePatientRegistrationPayload(manualInput.trim(), clinicId);
    if (validation.success) {
      setDetectedClinicId(validation.clinicId);
      setScannerState("success");
      setStatusMessage("Code verified! Redirecting to registration…");
      stopCamera();

      setTimeout(() => {
        onSuccess({
          clinicId: validation.clinicId,
          registrationUrl: validation.registrationUrl,
        });
      }, 400);
    } else {
      setManualError(validation.error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4 w-full max-w-md mx-auto">
      {/* Video Viewfinder Container */}
      <div className="relative w-full aspect-square max-w-[320px] rounded-2xl overflow-hidden border-2 border-border bg-slate-950 shadow-inner flex items-center justify-center">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            scannerState === "scanning" || scannerState === "success" ? "opacity-100" : "opacity-0"
          }`}
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Viewfinder Target Reticle */}
        {scannerState === "scanning" && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Corner brackets */}
            <div className="relative size-48 sm:size-56 border-2 border-primary/60 rounded-xl overflow-hidden shadow-2xl">
              {/* Animated scanline */}
              <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)] top-1/2 -translate-y-1/2" />
            </div>
            <p className="mt-3 text-xs font-medium text-white/80 bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-sm">
              Align QR code inside the frame
            </p>
          </div>
        )}

        {/* State Overlays */}
        {scannerState === "requesting_permission" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 text-white space-y-3">
            <Loader2 className="size-8 text-primary animate-spin" />
            <p className="text-sm font-medium">Requesting camera access…</p>
            <p className="text-xs text-slate-300">
              Please click &quot;Allow&quot; if prompted by your browser to scan the QR code.
            </p>
          </div>
        )}

        {scannerState === "success" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/95 text-white space-y-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="size-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="size-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white">QR Code Verified!</h4>
              {detectedClinicId && (
                <p className="text-xs text-slate-300 font-mono">
                  Clinic: {detectedClinicId.slice(0, 8)}…{detectedClinicId.slice(-4)}
                </p>
              )}
            </div>
          </div>
        )}

        {scannerState === "permission_denied" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/95 text-white space-y-3">
            <div className="size-10 rounded-full bg-destructive/20 text-destructive flex items-center justify-center">
              <CameraOff className="size-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white">Camera Access Denied</h4>
              <p className="text-xs text-slate-300">
                Camera permission was not granted. You can retry or enter the code manually below.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={startCamera}
              className="mt-2 text-xs gap-1.5 bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <RefreshCw className="size-3.5" />
              Retry camera
            </Button>
          </div>
        )}

        {scannerState === "unsupported" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/95 text-white space-y-3">
            <div className="size-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <CameraOff className="size-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white">Camera Unavailable</h4>
              <p className="text-xs text-slate-300">
                This browser or device does not support direct camera video capture.
              </p>
            </div>
          </div>
        )}

        {scannerState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/95 text-white space-y-3">
            <div className="size-10 rounded-full bg-destructive/20 text-destructive flex items-center justify-center">
              <AlertCircle className="size-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white">Camera Error</h4>
              <p className="text-xs text-slate-300">{statusMessage || "Unable to start camera stream."}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={startCamera}
              className="mt-2 text-xs gap-1.5 bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <RefreshCw className="size-3.5" />
              Try again
            </Button>
          </div>
        )}
      </div>

      {/* Dynamic Feedback Message */}
      {statusMessage && scannerState === "scanning" && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20 animate-in fade-in">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Manual Payload Fallback Form */}
      <div className="w-full pt-2 border-t border-border space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium">
            <Keyboard className="size-3.5" />
            Manual registration link entry
          </span>
          {scannerState === "scanning" && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[11px]">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Camera live
            </span>
          )}
        </div>

        <form onSubmit={handleManualSubmit} className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Paste registration URL or clinic UUID…"
              value={manualInput}
              onChange={e => {
                setManualInput(e.target.value);
                setManualError("");
              }}
              className="text-xs h-9 font-mono"
            />
            <Button type="submit" size="sm" className="h-9 text-xs px-3 gap-1.5 shrink-0">
              <ShieldCheck className="size-3.5" />
              Verify
            </Button>
          </div>
          {manualError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="size-3" />
              {manualError}
            </p>
          )}
        </form>
      </div>

      {/* Cancel button if provided */}
      {onCancel && (
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs text-muted-foreground">
          Cancel
        </Button>
      )}
    </div>
  );
}
