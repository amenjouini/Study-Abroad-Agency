import type { Metadata } from "next";
import { AppointmentsCalendar } from "@/components/staff/appointments-calendar";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Appointments" };

export default async function StaffAppointments({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const user = await requireArea("staff");
  return <AppointmentsCalendar user={user} area="staff" searchParams={await searchParams} />;
}
