import type { UserAccess } from "@/lib/access";

export type ClinicSetupForm = { displayName: string; name: string; phone: string; email: string; address: string; city: string; state: string };
export type ClinicSetupErrors = Partial<Record<keyof ClinicSetupForm, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s()-]{5,19}$/;

/** Client-side checks mirror the database rules; the database re-validates everything. */
export function validateClinicSetup(f: ClinicSetupForm): ClinicSetupErrors {
  const e: ClinicSetupErrors = {};
  const dn = f.displayName.trim();
  if (!dn) e.displayName = "Enter a clinic display name.";
  else if (dn.length > 60) e.displayName = "Keep the display name to 60 characters or fewer.";
  const n = f.name.trim();
  if (n.length < 2) e.name = "Enter the clinic's name.";
  else if (n.length > 120) e.name = "Keep the clinic name to 120 characters or fewer.";
  if (f.phone.trim() && !PHONE.test(f.phone.trim())) e.phone = "Enter a valid phone number.";
  if (f.email.trim() && !EMAIL.test(f.email.trim())) e.email = "Enter a valid email address.";
  if (f.address.trim().length > 300) e.address = "Keep the address to 300 characters or fewer.";
  if (f.city.trim().length > 80) e.city = "Keep the city to 80 characters or fewer.";
  if (f.state.trim().length > 80) e.state = "Keep the state to 80 characters or fewer.";
  return e;
}

/** UI hint only: the database is the authority on eligibility. */
export function canStartFirstClinic(access: UserAccess) {
  return !access.memberships.some(m => m.status === "ACTIVE");
}

export function clinicSetupErrorMessage(message: string | undefined): string {
  const m = message ?? "";
  if (/Not eligible/i.test(m)) return "Your account already has clinic access, so it can't create a new clinic.";
  if (/Authentication required|Active profile/i.test(m)) return "Please sign in again with an active account to set up a clinic.";
  if (/display name|Clinic name/i.test(m)) return m;
  return "We couldn't create your clinic. Nothing was saved — please try again.";
}
