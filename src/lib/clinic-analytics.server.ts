import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  clinicBuckets,
  calculateComparison,
  CLINIC_FUTURE_VISUALIZATIONS,
  type ClinicAnalyticsData,
  type ClinicAnalyticsRange,
} from "./clinic-analytics-rules";

type Client = SupabaseClient<Database>;

export async function assertOperationalClinicOwner(db: Client, userId: string, clinicId: string) {
  const [p, m, op] = await Promise.all([
    db.from("profiles").select("platform_role,status").eq("id", userId).maybeSingle(),
    db.from("clinic_members").select("role,status").eq("user_id", userId).eq("clinic_id", clinicId).maybeSingle(),
    db.rpc("clinic_is_operational", { p_clinic: clinicId }),
  ]);

  if (
    p.error ||
    m.error ||
    op.error ||
    p.data?.status !== "ACTIVE" ||
    m.data?.role !== "OWNER" ||
    m.data.status !== "ACTIVE" ||
    op.data !== true
  ) {
    throw new Error("Operational clinic owner access is required.");
  }
}

/** Determines ISO date range strings for current period and comparison prior period */
function resolveTimeBounds(range: ClinicAnalyticsRange, now = new Date()): {
  currentStart: string;
  currentEnd: string;
  prevStart: string;
  prevEnd: string;
} {
  const dayMs = 86_400_000;
  const currentEnd = now.toISOString();

  if (range === "today") {
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const yesterdayStart = new Date(todayStart.getTime() - dayMs);
    return {
      currentStart: todayStart.toISOString(),
      currentEnd,
      prevStart: yesterdayStart.toISOString(),
      prevEnd: todayStart.toISOString(),
    };
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const durationMs = days * dayMs;
  const currentStart = new Date(now.getTime() - durationMs).toISOString();
  const prevEnd = currentStart;
  const prevStart = new Date(new Date(currentStart).getTime() - durationMs).toISOString();

  return { currentStart, currentEnd, prevStart, prevEnd };
}

export async function readClinicAnalytics(
  db: Client,
  userId: string,
  clinicId: string,
  range: ClinicAnalyticsRange = "30d",
  doctorId = ""
): Promise<ClinicAnalyticsData> {
  await assertOperationalClinicOwner(db, userId, clinicId);

  const { data: clinicRow } = await db
    .from("clinics")
    .select("name, currency, timezone")
    .eq("id", clinicId)
    .maybeSingle();

  const clinicName = clinicRow?.name || "Clinic";
  const currency = clinicRow?.currency || "INR";
  const timezone = clinicRow?.timezone || "Asia/Kolkata";

  const now = new Date();
  const { currentStart, currentEnd, prevStart, prevEnd } = resolveTimeBounds(range, now);
  const buckets = clinicBuckets(range, now);

  // 1. Appointments: Current & Previous
  let apptQuery = db
    .from("appointments")
    .select("id, status, appointment_type, scheduled_start, doctor_profile_id")
    .eq("clinic_id", clinicId)
    .gte("scheduled_start", currentStart)
    .lte("scheduled_start", currentEnd);

  let prevApptQuery = db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .gte("scheduled_start", prevStart)
    .lt("scheduled_start", prevEnd);

  if (doctorId) {
    apptQuery = apptQuery.eq("doctor_profile_id", doctorId);
    prevApptQuery = prevApptQuery.eq("doctor_profile_id", doctorId);
  }

  // 2. Financials: Invoices & Payments
  const invoicesQuery = db
    .from("invoices")
    .select("id, total_amount, amount_paid, amount_due, status, created_at")
    .eq("clinic_id", clinicId)
    .gte("created_at", currentStart)
    .lte("created_at", currentEnd);

  const prevInvoicesQuery = db
    .from("invoices")
    .select("total_amount, amount_paid")
    .eq("clinic_id", clinicId)
    .gte("created_at", prevStart)
    .lt("created_at", prevEnd);

  const paymentsQuery = db
    .from("payments")
    .select("amount, payment_method, status, created_at")
    .eq("clinic_id", clinicId)
    .gte("created_at", currentStart)
    .lte("created_at", currentEnd);

  // 3. Patients
  const patientsTotalQuery = db
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId);

  const patientsNewQuery = db
    .from("patients")
    .select("id, created_at")
    .eq("clinic_id", clinicId)
    .gte("created_at", currentStart)
    .lte("created_at", currentEnd);

  const prevPatientsNewQuery = db
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .gte("created_at", prevStart)
    .lt("created_at", prevEnd);

  // 4. Consultations & Attendance
  const consultationsQuery = db
    .from("consultations")
    .select("id, status, created_at")
    .eq("clinic_id", clinicId)
    .gte("created_at", currentStart)
    .lte("created_at", currentEnd);

  const attendanceQuery = db
    .from("clinic_attendance")
    .select("date, role, status")
    .eq("clinic_id", clinicId)
    .gte("date", currentStart.slice(0, 10))
    .lte("date", currentEnd.slice(0, 10));

  const doctorsCountQuery = db
    .from("doctor_profiles")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("status", "ACTIVE");

  const staffCountQuery = db
    .from("clinic_members")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId)
    .eq("role", "STAFF")
    .eq("status", "ACTIVE");

  // 5. AI usage
  const aiUsageQuery = db
    .from("ai_usage")
    .select("credits_used, feature, created_at")
    .eq("clinic_id", clinicId)
    .gte("created_at", currentStart)
    .lte("created_at", currentEnd);

  // Execute in parallel
  const [
    apptsRes,
    prevApptsRes,
    invRes,
    prevInvRes,
    payRes,
    patTotalRes,
    patNewRes,
    prevPatNewRes,
    consRes,
    attRes,
    docCountRes,
    staffCountRes,
    aiRes,
  ] = await Promise.all([
    apptQuery,
    prevApptQuery,
    invoicesQuery,
    prevInvoicesQuery,
    paymentsQuery,
    patientsTotalQuery,
    patientsNewQuery,
    prevPatientsNewQuery,
    consultationsQuery,
    attendanceQuery,
    doctorsCountQuery,
    staffCountQuery,
    aiUsageQuery,
  ]);

  // Process Appointments
  const appts = apptsRes.data || [];
  const totalAppts = appts.length;
  let completedAppts = 0;
  let scheduledAppts = 0;
  let confirmedAppts = 0;
  let cancelledAppts = 0;
  let noShowAppts = 0;

  const statusMap = new Map<string, number>();
  const typeMap = new Map<string, number>();

  for (const a of appts) {
    if (a.status === "COMPLETED") completedAppts++;
    else if (a.status === "SCHEDULED") scheduledAppts++;
    else if (a.status === "CONFIRMED") confirmedAppts++;
    else if (a.status === "CANCELLED") cancelledAppts++;
    else if (a.status === "NO_SHOW") noShowAppts++;

    const s = a.status || "UNKNOWN";
    statusMap.set(s, (statusMap.get(s) || 0) + 1);

    const t = a.appointment_type || "OTHER";
    typeMap.set(t, (typeMap.get(t) || 0) + 1);
  }

  const completionRate = totalAppts > 0 ? Math.round((completedAppts / totalAppts) * 100) : 0;
  const apptComparison = calculateComparison(totalAppts, prevApptsRes.count);

  // Appointment trend per bucket
  const apptTrend = buckets.map(b => {
    const inBucket = appts.filter(a => a.scheduled_start >= b.start && a.scheduled_start < b.end);
    return {
      label: b.label,
      count: inBucket.length,
      completed: inBucket.filter(a => a.status === "COMPLETED").length,
    };
  });

  const apptStatusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));
  const apptTypeBreakdown = Array.from(typeMap.entries()).map(([type, count]) => ({ type, count }));

  // Process Invoices & Payments
  const invoices = invRes.data || [];
  const payments = (payRes.data || []).filter(p => p.status === "SUCCESS");

  let totalBilled = 0;
  let totalCollected = 0;
  let outstandingBalance = 0;
  const invStatusMap = new Map<string, { count: number; amount: number }>();

  for (const inv of invoices) {
    const total = inv.total_amount || 0;
    const paid = inv.amount_paid || 0;
    const due = inv.amount_due || 0;

    totalBilled += total;
    totalCollected += paid;
    outstandingBalance += due;

    const s = inv.status || "UNKNOWN";
    const cur = invStatusMap.get(s) || { count: 0, amount: 0 };
    invStatusMap.set(s, { count: cur.count + 1, amount: cur.amount + total });
  }

  const prevInvoices = prevInvRes.data || [];
  const prevBilled = prevInvoices.reduce((acc, i) => acc + (i.total_amount || 0), 0);
  const prevCollected = prevInvoices.reduce((acc, i) => acc + (i.amount_paid || 0), 0);

  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;
  const comparisonBilled = calculateComparison(totalBilled, prevBilled);
  const comparisonCollected = calculateComparison(totalCollected, prevCollected);

  // Financials trend per bucket
  const financialTrend = buckets.map(b => {
    const inBucketInv = invoices.filter(i => i.created_at >= b.start && i.created_at < b.end);
    const inBucketPay = payments.filter(p => p.created_at >= b.start && p.created_at < b.end);
    return {
      label: b.label,
      billed: inBucketInv.reduce((sum, i) => sum + (i.total_amount || 0), 0),
      collected: inBucketPay.reduce((sum, p) => sum + (p.amount || 0), 0),
    };
  });

  const invoiceStatusBreakdown = Array.from(invStatusMap.entries()).map(([status, data]) => ({
    status,
    count: data.count,
    amount: data.amount,
  }));

  // Payment methods
  const payMethodMap = new Map<string, { amount: number; count: number }>();
  for (const p of payments) {
    const m = p.payment_method || "OTHER";
    const cur = payMethodMap.get(m) || { amount: 0, count: 0 };
    payMethodMap.set(m, { amount: cur.amount + (p.amount || 0), count: cur.count + 1 });
  }
  const paymentMethodsBreakdown = Array.from(payMethodMap.entries()).map(([method, data]) => ({
    method,
    amount: data.amount,
    count: data.count,
  }));

  // Process Patients
  const totalActivePatients = patTotalRes.count || 0;
  const newPatients = patNewRes.data || [];
  const comparisonNew = calculateComparison(newPatients.length, prevPatNewRes.count);

  const patTrend = buckets.map(b => ({
    label: b.label,
    newPatients: newPatients.filter(p => p.created_at >= b.start && p.created_at < b.end).length,
  }));

  // Process Team & Consultations
  const consultations = consRes.data || [];
  const consultationsTotal = consultations.length;
  const consultationsCompleted = consultations.filter(c => c.status === "COMPLETED").length;
  const consultationsDraft = consultations.filter(c => c.status === "DRAFT" || c.status === "IN_PROGRESS").length;

  const attendance = attRes.data || [];
  const doctorAtt = attendance.filter(a => a.role === "DOCTOR");
  const staffAtt = attendance.filter(a => a.role === "STAFF");

  const docPresent = doctorAtt.filter(a => a.status === "PRESENT").length;
  const docAbsent = doctorAtt.filter(a => a.status === "ABSENT").length;
  const docTotal = doctorAtt.length;
  const doctorAttendanceRate = docTotal > 0 ? Math.round((docPresent / docTotal) * 100) : 100;

  const staffPresent = staffAtt.filter(a => a.status === "PRESENT").length;
  const staffTotal = staffAtt.length;
  const staffAttendanceRate = staffTotal > 0 ? Math.round((staffPresent / staffTotal) * 100) : 100;

  // Process AI usage
  const aiRecords = aiRes.data || [];
  const totalAiCredits = aiRecords.reduce((acc, r) => acc + (r.credits_used || 0), 0);
  const aiFeatureMap = new Map<string, number>();
  for (const r of aiRecords) {
    const f = r.feature || "General";
    aiFeatureMap.set(f, (aiFeatureMap.get(f) || 0) + (r.credits_used || 0));
  }
  const aiFeatures = Array.from(aiFeatureMap.entries())
    .map(([feature, credits]) => ({ feature, credits }))
    .sort((a, b) => b.credits - a.credits);

  // Operational alerts / exceptions
  const operationalAlerts: ClinicAnalyticsData["operationalAlerts"] = [];

  // 1. High cancellation rate alert
  if (totalAppts >= 5 && cancelledAppts / totalAppts > 0.2) {
    operationalAlerts.push({
      id: "high-cancellation",
      type: "warning",
      title: "High Appointment Cancellation Rate",
      description: `${cancelledAppts} of ${totalAppts} appointments (${Math.round((cancelledAppts / totalAppts) * 100)}%) were cancelled during this period. Review schedule buffering and confirmation notices.`,
    });
  }

  // 2. High outstanding accounts receivable
  if (outstandingBalance > 0 && collectionRate < 70 && totalBilled > 0) {
    operationalAlerts.push({
      id: "low-collection",
      type: "warning",
      title: "Sub-Optimal Collection Rate",
      description: `Current collection efficiency is at ${collectionRate}%. Outstanding receivables total ${currency} ${outstandingBalance.toLocaleString("en-IN")}.`,
    });
  }

  // 3. Draft consultations backlog
  if (consultationsDraft >= 5) {
    operationalAlerts.push({
      id: "draft-consultations",
      type: "info",
      title: "Open Draft Consultations",
      description: `There are ${consultationsDraft} consultation notes still in draft or in-progress state awaiting physician sign-off.`,
    });
  }

  return {
    clinicId,
    clinicName,
    range,
    timezone,
    currency,
    appointments: {
      total: totalAppts,
      completed: completedAppts,
      scheduled: scheduledAppts,
      confirmed: confirmedAppts,
      cancelled: cancelledAppts,
      noShow: noShowAppts,
      completionRate,
      comparison: apptComparison,
      trend: apptTrend,
      statusBreakdown: apptStatusBreakdown,
      typeBreakdown: apptTypeBreakdown,
    },
    financials: {
      totalBilled,
      totalCollected,
      outstandingBalance,
      collectionRate,
      comparisonBilled,
      comparisonCollected,
      trend: financialTrend,
      invoiceStatusBreakdown,
      paymentMethodsBreakdown,
    },
    patients: {
      totalActive: totalActivePatients,
      newRegistrations: newPatients.length,
      comparisonNew,
      trend: patTrend,
    },
    clinical: {
      consultationsTotal,
      consultationsCompleted,
      consultationsDraft,
      doctorAttendanceRate,
      staffAttendanceRate,
      doctorsPresentDays: docPresent,
      doctorsAbsentDays: docAbsent,
      doctorsCount: docCountRes.count || 0,
      staffCount: staffCountRes.count || 0,
    },
    aiUsage: {
      totalCredits: totalAiCredits,
      features: aiFeatures,
    },
    operationalAlerts,
    futureVisualizations: CLINIC_FUTURE_VISUALIZATIONS,
  };
}
