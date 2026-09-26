import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppointmentSettingsForm } from "@/components/admin/admin-widgets";
import { AppointmentsCalendar } from "@/components/staff/appointments-calendar";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/primitives";
import { requirePermission } from "@/server/authz";
import { loadSettings } from "@/server/appointments";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Appointments" };

export default async function AdminAppointments({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const user = await requireArea("admin");
  await requirePermission(user, "appointments.settings");
  const t = await getTranslations("admin.appointments");
  const settings = await loadSettings();
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings")}</CardTitle>
        </CardHeader>
        <CardBody>
          <AppointmentSettingsForm initial={settings} />
        </CardBody>
      </Card>
      <AppointmentsCalendar user={user} area="admin" searchParams={await searchParams} />
    </div>
  );
}
