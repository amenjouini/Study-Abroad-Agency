import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Profile" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium">{value || "—"}</dd>
    </div>
  );
}

export default async function StudentProfile() {
  const user = await requireArea("student");
  const locale = await getLocale();
  const t = await getTranslations("student.profile");
  const tw = await getTranslations("student.wizard.f");
  const te = await getTranslations("enums");
  const s = await db.student.findUniqueOrThrow({ where: { id: user.studentId! }, include: { degrees: true, desiredCity: true, desiredProgram: { include: { university: true } } } });
  const edit = (step: number) => (
    <Link href={`/student/onboarding?step=${step}&from=profile`} className="text-xs font-medium text-primary hover:underline">
      {t("edit")}
    </Link>
  );
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={t("title")} description={user.email} />
      <Card>
        <CardHeader>
          <CardTitle>{t("personal")}</CardTitle>
          {edit(1)}
        </CardHeader>
        <CardBody>
          <dl className="divide-y divide-border">
            <Row label={tw("firstName")} value={s.firstName} />
            <Row label={tw("lastName")} value={s.lastName} />
            <Row label={tw("phone")} value={s.phone} />
            <Row label={tw("dateOfBirth")} value={s.dateOfBirth ? formatDate(s.dateOfBirth, locale) : ""} />
            <Row label={tw("passportNumber")} value={s.passportNumber} />
            <Row label={tw("passportExpiry")} value={s.passportExpiry ? formatDate(s.passportExpiry, locale) : ""} />
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("language")}</CardTitle>
          {edit(2)}
        </CardHeader>
        <CardBody>
          <dl className="divide-y divide-border">
            <Row label={tw("studyLanguage")} value={s.studyLanguage ? te(`TeachingLanguage.${s.studyLanguage}`) : ""} />
            <Row label={tw("languageLevel")} value={s.languageLevel} />
            <Row label={tw("languageCertificate")} value={[s.languageCertificate, s.languageCertificateLevel].filter(Boolean).join(" ")} />
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("academic")}</CardTitle>
          {edit(3)}
        </CardHeader>
        <CardBody>
          <dl className="divide-y divide-border">
            <Row label={tw("bacYear")} value={s.bacYear} />
            <Row label={tw("bacSection")} value={s.bacSection} />
            <Row label={tw("bacGrade")} value={s.bacGrade?.toString()} />
            <Row label={tw("desiredDegreeLevel")} value={s.desiredDegreeLevel ? te(`DegreeLevel.${s.desiredDegreeLevel}`) : ""} />
            {s.degrees.map((d) => (
              <Row key={d.id} label={te(`DegreeLevel.${d.level}`)} value={d.title} />
            ))}
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("study")}</CardTitle>
          {edit(4)}
        </CardHeader>
        <CardBody>
          <dl className="divide-y divide-border">
            <Row label={tw("city")} value={s.desiredCity?.name} />
            <Row label={tw("program")} value={s.desiredProgram ? `${s.desiredProgram.university.name} — ${s.desiredProgram.name}` : ""} />
          </dl>
        </CardBody>
      </Card>
      <p className="text-xs text-muted-foreground">{t("locale")}</p>
    </div>
  );
}
