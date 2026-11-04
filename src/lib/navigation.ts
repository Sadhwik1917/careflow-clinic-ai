import { LayoutDashboard, Users, CalendarDays, ListOrdered, Stethoscope, UserRoundCog, Receipt, ChartNoAxesCombined, Sparkles, Settings, ClipboardList, Pill, CircleUserRound, History, Building2, CreditCard, ShieldCheck, type LucideIcon } from "lucide-react";

export type AppRole = "PLATFORM_ADMIN" | "OWNER" | "DOCTOR" | "STAFF" | "PATIENT";
export type NavigationItem = { title: string; path: string; icon: LucideIcon; group: "Workspace" | "Management" | "Account" };
function item(title: string, path: string, icon: LucideIcon, group: NavigationItem["group"] = "Workspace"): NavigationItem { return { title, path, icon, group }; }
export const roleLabels: Record<AppRole, string> = { PLATFORM_ADMIN: "Platform admin", OWNER: "Clinic owner", DOCTOR: "Doctor", STAFF: "Staff", PATIENT: "Patient" };
// Presentation only: these configurations are not authorization or access guards.
export const navigation: Record<AppRole, NavigationItem[]> = {
  PLATFORM_ADMIN: [item("Dashboard", "/admin/dashboard", LayoutDashboard), item("Clinics", "/admin/clinics", Building2), item("Verifications", "/admin/verifications", ShieldCheck), item("Subscriptions", "/admin/subscriptions", CreditCard), item("Users", "/admin/users", Users), item("Analytics", "/admin/analytics", ChartNoAxesCombined, "Management"), item("Settings", "/admin/settings", Settings, "Account")],
  OWNER: [item("Dashboard", "/clinic/dashboard", LayoutDashboard), item("Patients", "/clinic/patients", Users), item("Appointments", "/clinic/appointments", CalendarDays), item("Queue", "/clinic/queue", ListOrdered), item("Doctors", "/clinic/doctors", Stethoscope), item("Staff", "/clinic/staff", UserRoundCog), item("Billing", "/clinic/billing", Receipt, "Management"), item("Analytics", "/clinic/reports", ChartNoAxesCombined, "Management"), item("AI assistant", "/clinic/ai", Sparkles, "Management"), item("Verification", "/clinic/verification", ShieldCheck, "Account"), item("Plans", "/clinic/plans", CreditCard, "Account"), item("Settings", "/clinic/settings", Settings, "Account")],
  DOCTOR: [item("Dashboard", "/doctor/dashboard", LayoutDashboard), item("Appointments", "/doctor/appointments", CalendarDays), item("Patients", "/doctor/patients", Users), item("Consultations", "/doctor/consultations", ClipboardList), item("Prescriptions", "/doctor/prescriptions", Pill), item("Profile", "/doctor/profile", CircleUserRound, "Account")],
  STAFF: [item("Dashboard", "/staff/dashboard", LayoutDashboard), item("Patients", "/staff/patients", Users), item("Appointments", "/staff/appointments", CalendarDays), item("Queue", "/staff/queue", ListOrdered), item("Billing", "/staff/billing", Receipt), item("Profile", "/staff/profile", CircleUserRound, "Account")],
  PATIENT: [item("Dashboard", "/patient/dashboard", LayoutDashboard), item("Appointments", "/patient/appointments", CalendarDays), item("Prescriptions", "/patient/prescriptions", Pill), item("Bills", "/patient/bills", Receipt), item("Medical history", "/patient/history", History), item("Profile", "/patient/profile", CircleUserRound, "Account")],
};
export function roleForPath(pathname: string): AppRole {
  if (pathname.startsWith("/admin/")) return "PLATFORM_ADMIN";
  if (pathname.startsWith("/doctor/")) return "DOCTOR";
  if (pathname.startsWith("/staff/")) return "STAFF";
  if (pathname.startsWith("/patient/")) return "PATIENT";
  return "OWNER";
}
export function pageMetadata(title: string, role: AppRole) {
  const name = `${title} · ${roleLabels[role]} — CAREFLOW AI`;
  const description = `CAREFLOW AI ${roleLabels[role].toLowerCase()} ${title.toLowerCase()} workspace.`;
  return { meta: [{ title: name }, { name: "description", content: description }, { property: "og:title", content: name }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] };
}