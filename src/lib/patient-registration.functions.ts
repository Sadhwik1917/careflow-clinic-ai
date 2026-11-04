import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const clinicInput = z.object({ clinicId: z.string().uuid() }).strict();

function extractClientIp(): string {
  try {
    const req = getRequest();
    if (!req || !req.headers) return "unknown";
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]?.trim() || "unknown";
    return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

export const getPublicClinicInfoFn = createServerFn({ method: "POST" })
  .validator(i => clinicInput.parse(i))
  .handler(async ({ data }) => {
    const s = await import("./patient-registration.server");
    return s.getPublicClinicInfo(data.clinicId);
  });

export const registerPatientSelfFn = createServerFn({ method: "POST" })
  .validator(i =>
    z
      .object({
        origin: z.string().url(),
        input: z.unknown(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data }) => {
    const s = await import("./patient-registration.server");
    const ip = extractClientIp();
    return s.registerPatientSelf(data.origin, data.input, ip);
  });

export const resendPatientActivationFn = createServerFn({ method: "POST" })
  .validator(i =>
    z
      .object({
        origin: z.string().url(),
        input: z.unknown(),
      })
      .strict()
      .parse(i)
  )
  .handler(async ({ data }) => {
    const s = await import("./patient-registration.server");
    const ip = extractClientIp();
    return s.resendPatientActivation(data.origin, data.input, ip);
  });

export const syncPatientAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await import("./patient-registration.server");
    // Secure account linking relies entirely on verified server-side Auth data
    return s.linkVerifiedPatientAccount(context.userId);
  });
