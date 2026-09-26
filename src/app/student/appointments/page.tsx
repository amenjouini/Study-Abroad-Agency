import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EnumBadge } from "@/components/status-badge";
import { Card, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { todayISO, addCalendarDays } from "@/lib/dates";
import { formatDateTime } from "@/lib/format";
import { ownCaseId } from "@/server/case-access";
import { requireArea } from "@/server/session";
import { BookingForm } from "./booking";
import { CancelButton } from "./cancel-button";

export const metadata: Metadata = { title: "Appointments" };

export default async function StudentAppointments() {
  const user = await requireArea("student");
  const locale = await getLocale();
  const t = await getTranslations("student.appointments");
  const te = await getTranslations("enums");
  const list = await db.agencyAppointment.findMany({ where: { caseId: await ownCaseId(user) }, orderBy: { startsAt: "desc" } });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <BookingForm minDate={addCalendarDays(todayISO(), 1)} />
      <Card>
        <CardHeader>
          <CardTitle>{t("mine")}</CardTitle>
        </CardHeader>
        {list.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t("none")} />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                <div>
                  <p className="text-sm font-medium">{formatDateTime(a.startsAt, locale)}</p>
                  <p className="text-xs text-muted-foreground">
                    {te(`AppointmentType.${a.type}`)} — {a.reason}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <EnumBadge enumName="AppointmentStatus" value={a.status} />
                  {["REQUESTED", "CONFIRMED", "RESCHEDULED"].includes(a.status) && a.startsAt > new Date() ? <CancelButton id={a.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
