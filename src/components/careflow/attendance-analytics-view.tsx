import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  UserCheck,
  UserX,
  Users,
  Stethoscope,
  Clock,
  CalendarX,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { PageTitle } from "@/components/careflow/page-title";
import { StatisticsCard } from "@/components/careflow/statistics-card";
import { StatusBadge, EmptyState, LoadingState } from "@/components/careflow/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DatePicker } from "@/components/careflow/date-picker";
import { MarkDoctorAbsentDialog } from "@/components/careflow/mark-doctor-absent-dialog";
import { RecordAttendanceDialog } from "@/components/careflow/record-attendance-dialog";
import { attendanceAnalyticsQuery, attendanceForDateQuery } from "@/lib/attendance-queries";
import { clinicHoursQuery } from "@/lib/appointment-queries";
import { getClinicLocalDate } from "@/lib/appointments";
import type { AttendanceRange } from "@/lib/attendance";

interface AttendanceAnalyticsViewProps {
  userId: string;
  clinicId: string;
}

export function AttendanceAnalyticsView({ userId, clinicId }: AttendanceAnalyticsViewProps) {
  // Clinic metadata for timezone & operating hours
  const { data: clinicHoursData } = useQuery(clinicHoursQuery(userId, clinicId));
  const timeZone = clinicHoursData?.timezone || "Asia/Kolkata";
  const todayStr = getClinicLocalDate(new Date(), timeZone);

  // Selected date or range filter
  const [selectedRange, setSelectedRange] = React.useState<AttendanceRange>("today");
  const [selectedDate, setSelectedDate] = React.useState<string>(todayStr);

  // Update selected date if todayStr initializes later
  React.useEffect(() => {
    if (todayStr && selectedRange === "today") {
      setSelectedDate(todayStr);
    }
  }, [todayStr, selectedRange]);

  // Daily detailed attendance query
  const {
    data: dailyData,
    isLoading: loadingDaily,
    isError: dailyError,
  } = useQuery(attendanceForDateQuery(userId, clinicId, selectedDate));

  // Analytics query (ranges)
  const {
    data: analyticsData,
    isLoading: loadingAnalytics,
  } = useQuery(attendanceAnalyticsQuery(userId, clinicId, selectedRange));

  const doctorsSummary = dailyData?.doctors ?? { total: 0, present: 0, absent: 0, unrecorded: 0 };
  const staffSummary = dailyData?.staff ?? { total: 0, present: 0, absent: 0, unrecorded: 0 };

  const doctorRows = dailyData?.doctorRows ?? [];
  const staffRows = dailyData?.staffRows ?? [];
  const dailyTrends = analyticsData?.dailyTrends ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageTitle
        title="Attendance & Analytics"
        description="Daily presence, absence tracking, and team attendance records for doctors and staff."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MarkDoctorAbsentDialog
              userId={userId}
              clinicId={clinicId}
              defaultDate={selectedDate}
            />
          </div>
        }
      />

      {/* Date & Range Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={selectedRange}
            onValueChange={(val) => {
              const r = val as AttendanceRange;
              setSelectedRange(r);
              if (r === "today") {
                setSelectedDate(todayStr);
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="7d">Last 7 days</TabsTrigger>
              <TabsTrigger value="30d">Last 30 days</TabsTrigger>
              <TabsTrigger value="custom">Specific date</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Inspecting date:</span>
          <DatePicker
            value={selectedDate}
            onChange={(d) => {
              setSelectedDate(d);
              if (selectedRange !== "custom") {
                setSelectedRange("custom");
              }
            }}
            timeZone={timeZone}
            className="w-40"
          />
        </div>
      </div>

      {/* Overview Statistics Cards */}
      <section aria-label="Attendance statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticsCard
          label="Doctors present"
          value={loadingDaily ? null : doctorsSummary.present}
          detail={`Out of ${doctorsSummary.total} active doctor${doctorsSummary.total === 1 ? "" : "s"}`}
          icon={Stethoscope}
        />
        <StatisticsCard
          label="Doctors absent"
          value={loadingDaily ? null : doctorsSummary.absent}
          detail={
            doctorsSummary.unrecorded > 0
              ? `${doctorsSummary.unrecorded} unrecorded / not marked`
              : "All doctor records accounted for"
          }
          icon={CalendarX}
        />
        <StatisticsCard
          label="Staff present"
          value={loadingDaily ? null : staffSummary.present}
          detail={`Out of ${staffSummary.total} active staff member${staffSummary.total === 1 ? "" : "s"}`}
          icon={Users}
        />
        <StatisticsCard
          label="Staff absent"
          value={loadingDaily ? null : staffSummary.absent}
          detail={
            staffSummary.unrecorded > 0
              ? `${staffSummary.unrecorded} unrecorded / not marked`
              : "All staff records accounted for"
          }
          icon={UserX}
        />
      </section>

      {/* Date Range Daily Breakdown Table if viewing 7d or 30d */}
      {(selectedRange === "7d" || selectedRange === "30d") && (
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Attendance trend breakdown</CardTitle>
            <CardDescription className="text-xs">
              Daily presence and absence log across {analyticsData?.totalDays ?? 0} days ({analyticsData?.startDate} to {analyticsData?.endDate}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAnalytics ? (
              <LoadingState label="Loading attendance trend data…" />
            ) : dailyTrends.length === 0 ? (
              <EmptyState
                title="No attendance trend data"
                description="Attendance records logged in this period will appear here."
                icon={FileSpreadsheet}
              />
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Doctors Present</TableHead>
                      <TableHead>Doctors Absent</TableHead>
                      <TableHead>Staff Present</TableHead>
                      <TableHead>Staff Absent</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyTrends.map((trend) => (
                      <TableRow
                        key={trend.date}
                        className={trend.date === selectedDate ? "bg-muted/60 font-medium" : ""}
                      >
                        <TableCell className="font-mono text-xs">{trend.date}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs text-success font-medium">
                            <UserCheck className="size-3.5" /> {trend.doctorsPresent}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs text-destructive font-medium">
                            <UserX className="size-3.5" /> {trend.doctorsAbsent}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs text-success font-medium">
                            <UserCheck className="size-3.5" /> {trend.staffPresent}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs text-destructive font-medium">
                            <UserX className="size-3.5" /> {trend.staffAbsent}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setSelectedDate(trend.date)}
                          >
                            View details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Details: Doctors & Staff Tables for Selected Date */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Doctors Attendance Card */}
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Doctor attendance</CardTitle>
              <CardDescription className="text-xs">
                {selectedDate} · {doctorsSummary.present} present, {doctorsSummary.absent} absent,{" "}
                {doctorsSummary.unrecorded} unrecorded
              </CardDescription>
            </div>
            <MarkDoctorAbsentDialog
              userId={userId}
              clinicId={clinicId}
              defaultDate={selectedDate}
              trigger={
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <CalendarX className="size-3.5 text-destructive" /> Mark absent
                </Button>
              }
            />
          </CardHeader>
          <CardContent>
            {loadingDaily ? (
              <LoadingState label="Loading doctor attendance…" />
            ) : dailyError ? (
              <div className="p-4 text-xs text-destructive">Could not load doctor attendance.</div>
            ) : doctorRows.length === 0 ? (
              <EmptyState
                title="No active doctors"
                description="Invite doctors to your clinic to track attendance."
                icon={Stethoscope}
                className="py-6"
              />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-md border text-sm">
                {doctorRows.map((doc) => {
                  const tone =
                    doc.status === "PRESENT"
                      ? "success"
                      : doc.status === "ABSENT"
                        ? "danger"
                        : "neutral";

                  const statusLabel =
                    doc.status === "PRESENT"
                      ? "Present"
                      : doc.status === "ABSENT"
                        ? "Absent"
                        : "Not marked";

                  return (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                          <Stethoscope className="size-4" />
                        </span>
                        <div>
                          <p className="font-medium text-foreground">
                            Dr. {doc.display_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.specialization || "Doctor"}
                            {doc.reason ? ` · "${doc.reason}"` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <StatusBadge tone={tone}>{statusLabel}</StatusBadge>

                        <RecordAttendanceDialog
                          clinicId={clinicId}
                          userId={doc.user_id}
                          memberName={`Dr. ${doc.display_name}`}
                          role="DOCTOR"
                          date={selectedDate}
                          currentStatus={doc.status}
                          currentReason={doc.reason}
                          timeZone={timeZone}
                          trigger={
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              {doc.status === "UNRECORDED" ? "Record" : "Correct"}
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staff Attendance Card */}
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Staff attendance</CardTitle>
              <CardDescription className="text-xs">
                {selectedDate} · {staffSummary.present} present, {staffSummary.absent} absent,{" "}
                {staffSummary.unrecorded} unrecorded
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {loadingDaily ? (
              <LoadingState label="Loading staff attendance…" />
            ) : dailyError ? (
              <div className="p-4 text-xs text-destructive">Could not load staff attendance.</div>
            ) : staffRows.length === 0 ? (
              <EmptyState
                title="No active staff members"
                description="Invite front-desk and support staff to track attendance."
                icon={Users}
                className="py-6"
              />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-md border text-sm">
                {staffRows.map((staff) => {
                  const tone =
                    staff.status === "PRESENT"
                      ? "success"
                      : staff.status === "ABSENT"
                        ? "danger"
                        : "neutral";

                  const statusLabel =
                    staff.status === "PRESENT"
                      ? "Present"
                      : staff.status === "ABSENT"
                        ? "Absent"
                        : "Not marked";

                  return (
                    <div
                      key={staff.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                          <Users className="size-4" />
                        </span>
                        <div>
                          <p className="font-medium text-foreground">{staff.display_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Staff
                            {staff.reason ? ` · "${staff.reason}"` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <StatusBadge tone={tone}>{statusLabel}</StatusBadge>

                        <RecordAttendanceDialog
                          clinicId={clinicId}
                          userId={staff.user_id}
                          memberName={staff.display_name}
                          role="STAFF"
                          date={selectedDate}
                          currentStatus={staff.status}
                          currentReason={staff.reason}
                          timeZone={timeZone}
                          trigger={
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              {staff.status === "UNRECORDED" ? "Record" : "Correct"}
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

