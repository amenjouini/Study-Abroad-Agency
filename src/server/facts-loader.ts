import { db, type Tx } from "@/lib/db";
import { toISODate, todayISO } from "@/lib/dates";
import type { ApplicationFacts, CaseFacts, ScholarshipFacts } from "@/lib/engine/types";
import { money } from "@/lib/money";

type Client = Tx | typeof db;

const iso = (d: Date | null | undefined) => (d ? toISODate(d) : null);

/** Load everything the engine needs about one case. The engine itself never reads the database. */
export async function loadCaseFacts(caseId: string, client: Client = db, today: string = todayISO()): Promise<CaseFacts> {
  const c = await client.case.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      student: { include: { degrees: true } },
      sponsors: { include: { relationship: true }, orderBy: { createdAt: "asc" } },
      fundingSources: { orderBy: { createdAt: "asc" } },
      applications: {
        orderBy: { createdAt: "asc" },
        include: { university: true, program: true, visa: true, universitaly: true },
      },
      scholarshipApps: { include: { scholarshipVersion: { include: { scholarship: true } }, fundingSources: true } },
    },
  });

  const applications: ApplicationFacts[] = c.applications.map((a) => ({
    id: a.id,
    label: `${a.university.name} — ${a.program.name}`,
    status: a.status,
    university: {
      id: a.university.id,
      name: a.university.name,
      cityId: a.university.cityId,
      visaAppointmentDeadline: iso(a.university.visaAppointmentDeadline),
    },
    program: {
      id: a.program.id,
      name: a.program.name,
      degreeLevel: a.program.degreeLevel,
      language: a.program.language,
      durationMonths: a.program.durationMonths,
      visaAppointmentDeadline: iso(a.program.visaAppointmentDeadline),
    },
    visa: a.visa
      ? {
          stage: a.visa.stage,
          appointmentDate: iso(a.visa.appointmentAt),
          arrivalDate: iso(a.visa.arrivalDate),
          programId: a.visa.programId,
          intendedEnrollmentProgramId: a.visa.intendedEnrollmentProgramId,
        }
      : null,
    universitalyValidated:
      a.universitaly?.status === "VALIDATED" || a.universitaly?.status === "TRANSMITTED_TO_EMBASSY",
  }));

  const scholarships: ScholarshipFacts[] = c.scholarshipApps.map((s) => {
    // EUR value: the staff-entered / native EUR amount of the linked funding source, else the award, else the published amount.
    const linked = s.fundingSources[0];
    let amountEur = null;
    if (linked) {
      if (linked.currency === "EUR") amountEur = money(linked.amountMinor, "EUR");
      else if (linked.eurValueMinor != null) amountEur = money(linked.eurValueMinor, "EUR");
    } else if (s.awardedAmountMinor != null && s.awardedCurrency === "EUR") {
      amountEur = money(s.awardedAmountMinor, "EUR");
    } else if (s.scholarshipVersion.amountMinor != null && s.scholarshipVersion.amountCurrency === "EUR") {
      amountEur = money(s.scholarshipVersion.amountMinor, "EUR");
    }
    return {
      id: s.id,
      name: s.scholarshipVersion.scholarship.name,
      kind: s.scholarshipVersion.scholarship.kind,
      status: s.status,
      amountEur,
    };
  });

  return {
    caseId: c.id,
    today,
    student: {
      id: c.student.id,
      nationality: c.student.nationality,
      passportExpiry: iso(c.student.passportExpiry),
      desiredDegreeLevel: c.student.desiredDegreeLevel,
      studyLanguage: c.student.studyLanguage,
      languageCertificateLevel: c.student.languageCertificateLevel,
      declarationStatus: c.student.declarationStatus,
      cimeaStatus: c.student.cimeaStatus,
      hasBac: c.student.bacYear != null,
      degreeLevels: c.student.degrees.map((d) => d.level),
    },
    sponsors: c.sponsors.map((s) => ({
      id: s.id,
      label: `${s.relationship.code} — ${s.fullName}`,
      relationship: s.relationship.code,
      professionalStatus: s.professionalStatus,
      pensionFund: s.pensionFund,
    })),
    fundingSources: c.fundingSources.map((f) => ({
      id: f.id,
      type: f.type,
      sponsorId: f.sponsorId,
      label: f.description ?? f.type,
      amount: money(f.amountMinor, f.currency),
      eurValue:
        f.eurValueMinor != null && f.exchangeRate && f.exchangeRateDate && f.convertedById
          ? {
              amountMinor: f.eurValueMinor,
              exchangeRate: f.exchangeRate.toString(),
              rateDate: toISODate(f.exchangeRateDate),
              convertedById: f.convertedById,
            }
          : null,
    })),
    applications,
    scholarships,
    plannedSubmissionDate: iso(c.plannedSubmissionDate),
    confirmedRequiredAmount:
      c.confirmedRequiredMinor != null && c.confirmedRequiredCurrency ? money(c.confirmedRequiredMinor, c.confirmedRequiredCurrency) : null,
  };
}
