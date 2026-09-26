import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { toDecimalString, money } from "@/lib/money";
import { toISODate } from "@/lib/dates";
import { localized } from "@/lib/format";
import { ownCaseId } from "@/server/case-access";
import { requireArea } from "@/server/session";
import { Wizard, type WizardData } from "./wizard";

export const metadata: Metadata = { title: "Getting started" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const user = await requireArea("student");
  const locale = await getLocale();
  const caseId = await ownCaseId(user);
  const sp = await searchParams;

  const [student, cities, programs, scholarships, funding, relationships, instances] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: user.studentId! }, include: { degrees: true } }),
    db.city.findMany({ include: { region: true }, orderBy: { name: "asc" } }),
    db.universityProgram.findMany({
      where: { active: true, academicYear: { isCurrent: true }, university: { active: true } },
      include: { university: { include: { city: true } } },
      orderBy: [{ university: { name: "asc" } }, { name: "asc" }],
    }),
    db.scholarshipVersion.findMany({
      where: { academicYear: { isCurrent: true }, scholarship: { active: true } },
      include: { scholarship: { include: { region: true } } },
    }),
    db.fundingSource.findMany({ where: { caseId }, include: { sponsor: { include: { relationship: true } } }, orderBy: { createdAt: "asc" } }),
    db.sponsorRelationship.findMany({ orderBy: { kinshipDegree: { sort: "asc", nulls: "last" } } }),
    db.documentRequirementInstance.findMany({
      where: { caseId, status: { not: "NOT_APPLICABLE" } },
      include: { requirement: true },
      orderBy: { requirement: { sortOrder: "asc" } },
    }),
  ]);

  if (student.onboardingCompleted && !sp.step) redirect("/student/dashboard");

  const saved = Math.min(Math.max(student.onboardingStep, 1), 10);
  const requested = Number(sp.step);
  const step = Number.isInteger(requested) && requested >= 1 ? Math.min(requested, saved) : saved;

  const data: WizardData = {
    student: {
      firstName: student.firstName,
      lastName: student.lastName,
      phone: student.phone ?? "",
      dateOfBirth: student.dateOfBirth ? toISODate(student.dateOfBirth) : "",
      gender: student.gender ?? "",
      passportNumber: student.passportNumber ?? "",
      passportExpiry: student.passportExpiry ? toISODate(student.passportExpiry) : "",
      address: student.address ?? "",
      studyLanguage: student.studyLanguage ?? "",
      languageLevel: student.languageLevel ?? "",
      languageCertificate: student.languageCertificate ?? "",
      languageCertificateLevel: student.languageCertificateLevel ?? "",
      languageCertificateExpiry: student.languageCertificateExpiry ? toISODate(student.languageCertificateExpiry) : "",
      bacYear: student.bacYear ?? "",
      bacSection: student.bacSection ?? "",
      bacGrade: student.bacGrade ? Number(student.bacGrade) : "",
      desiredDegreeLevel: student.desiredDegreeLevel ?? "",
      declarationStatus: student.declarationStatus,
      cimeaStatus: student.cimeaStatus,
      desiredCityId: student.desiredCityId ?? "",
      desiredProgramId: student.desiredProgramId ?? "",
      wantsScholarship: student.wantsScholarship,
    },
    degrees: student.degrees.map((d) => ({ level: d.level, title: d.title, institution: d.institution ?? "", year: d.year ?? "", grade: d.grade ?? "" })),
    cities: cities.map((c) => ({ id: c.id, name: c.name, region: c.region.name })),
    programs: programs.map((p) => ({
      id: p.id,
      name: p.name,
      degreeLevel: p.degreeLevel,
      language: p.language,
      durationMonths: p.durationMonths,
      universityName: p.university.name,
      cityId: p.university.cityId,
      cityName: p.university.city.name,
    })),
    scholarships: scholarships.map((s) => ({
      versionId: s.id,
      name: s.scholarship.name,
      region: s.scholarship.region?.name ?? "",
      deadline: s.deadline ? s.deadline.toISOString() : null,
    })),
    funding: funding.map((f) => ({
      id: f.id,
      type: f.type,
      description: f.description ?? "",
      amount: toDecimalString(money(f.amountMinor, f.currency)),
      currency: f.currency,
      sponsor: f.sponsor
        ? {
            id: f.sponsor.id,
            fullName: f.sponsor.fullName,
            relationshipCode: f.sponsor.relationship.code,
            professionalStatus: f.sponsor.professionalStatus ?? "",
            pensionFund: f.sponsor.pensionFund ?? "",
            occupation: f.sponsor.occupation ?? "",
            fundedByDescription: f.sponsor.fundedByDescription ?? "",
            sourceOfFunds: f.sponsor.sourceOfFunds ?? "",
          }
        : null,
    })),
    relationships: relationships.map((r) => ({ code: r.code })),
    checklist: instances.map((i) => ({
      id: i.id,
      name: localized(i.requirement.nameI18n, locale, i.requirement.name),
      subjectType: i.subjectType,
      subjectLabel: i.subjectLabel ?? "",
      status: i.status,
      mandatory: i.requirement.mandatory,
      kind: i.requirement.kind,
      reason: i.humanReviewReason ?? "",
    })),
    completed: student.onboardingCompleted,
  };

  return <Wizard step={step} savedStep={saved} data={data} />;
}
