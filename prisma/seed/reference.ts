import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  STAFF_DEFAULT_PERMISSIONS,
  STUDENT_PERMISSIONS,
} from "../../src/lib/permissions";
import { ITALIAN_HOLIDAYS } from "./holidays";

export async function seedRolesAndPermissions(db: PrismaClient) {
  for (const p of PERMISSIONS) {
    await db.permission.upsert({ where: { key: p.key }, update: { area: p.area, description: p.description }, create: p });
  }
  const perms = await db.permission.findMany();
  const idOf = new Map(perms.map((p) => [p.key, p.id]));

  const roles: Array<{ key: string; name: string; permissions: string[] }> = [
    { key: "OWNER", name: "Owner", permissions: ALL_PERMISSION_KEYS.filter((k) => !k.startsWith("self.")) },
    { key: "ADMIN", name: "Administrator", permissions: ALL_PERMISSION_KEYS.filter((k) => !k.startsWith("self.") && k !== "owner.manage") },
    { key: "STAFF", name: "Staff", permissions: STAFF_DEFAULT_PERMISSIONS },
    { key: "STUDENT", name: "Student", permissions: STUDENT_PERMISSIONS },
  ];
  for (const r of roles) {
    const role = await db.role.upsert({ where: { key: r.key }, update: { name: r.name }, create: { key: r.key, name: r.name } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: r.permissions.map((k) => ({ roleId: role.id, permissionId: idOf.get(k)! })) });
  }
}

const i18n = (en: string, fr: string, it: string, ar: string) => ({ en, fr, it, ar });

export const CASE_STAGES: Array<{ key: string; progress: number; names: [string, string, string, string] }> = [
  { key: "LEAD", progress: 0, names: ["Lead", "Prospect", "Contatto", "استفسار"] },
  { key: "REGISTRATION", progress: 5, names: ["Registration", "Inscription", "Registrazione", "التسجيل"] },
  { key: "PERSONAL_PROFILE", progress: 10, names: ["Personal profile", "Profil personnel", "Profilo personale", "الملف الشخصي"] },
  { key: "LANGUAGE", progress: 15, names: ["Language", "Langue", "Lingua", "اللغة"] },
  { key: "ACADEMIC_PROFILE", progress: 20, names: ["Academic profile", "Profil académique", "Profilo accademico", "الملف الأكاديمي"] },
  { key: "CITY_UNIVERSITY_PROGRAM", progress: 25, names: ["City / university / program", "Ville / université / programme", "Città / università / corso", "المدينة / الجامعة / التخصص"] },
  { key: "UNIVERSITY_APPLICATION", progress: 35, names: ["University application", "Candidature universitaire", "Domanda universitaria", "التقديم الجامعي"] },
  { key: "ADMISSION", progress: 45, names: ["Admission", "Admission", "Ammissione", "القبول"] },
  { key: "UNIVERSITALY", progress: 55, names: ["Universitaly", "Universitaly", "Universitaly", "Universitaly"] },
  { key: "SCHOLARSHIP", progress: 60, names: ["Scholarship", "Bourse", "Borsa di studio", "المنحة"] },
  { key: "FINANCIAL_DOCUMENTATION", progress: 65, names: ["Financial documentation", "Documents financiers", "Documentazione finanziaria", "الوثائق المالية"] },
  { key: "VISA_DOCUMENTATION", progress: 75, names: ["Visa documentation", "Documents de visa", "Documentazione per il visto", "وثائق التأشيرة"] },
  { key: "VISA_APPOINTMENT", progress: 80, names: ["Visa appointment", "Rendez-vous visa", "Appuntamento visto", "موعد التأشيرة"] },
  { key: "VISA_SUBMISSION", progress: 85, names: ["Visa submission", "Dépôt du visa", "Presentazione del visto", "إيداع طلب التأشيرة"] },
  { key: "VISA_DECISION", progress: 90, names: ["Visa decision", "Décision visa", "Decisione sul visto", "قرار التأشيرة"] },
  { key: "TRAVEL", progress: 93, names: ["Travel", "Voyage", "Viaggio", "السفر"] },
  { key: "ARRIVAL_IN_ITALY", progress: 96, names: ["Arrival in Italy", "Arrivée en Italie", "Arrivo in Italia", "الوصول إلى إيطاليا"] },
  { key: "PERMESSO_DI_SOGGIORNO", progress: 98, names: ["Permesso di soggiorno", "Permis de séjour", "Permesso di soggiorno", "تصريح الإقامة"] },
  { key: "FINAL_ENROLLMENT", progress: 100, names: ["Final enrollment", "Inscription définitive", "Immatricolazione definitiva", "التسجيل النهائي"] },
];

export async function seedReferenceData(db: PrismaClient) {
  // Countries: the destination is data, not code — other destinations can be added later.
  const countries = [
    ["TN", "Tunisia"], ["IT", "Italy"], ["FR", "France"], ["DE", "Germany"], ["CA", "Canada"], ["ES", "Spain"], ["TR", "Türkiye"],
  ];
  for (const [code, name] of countries) await db.country.upsert({ where: { code }, update: { name }, create: { code, name } });
  const italy = await db.country.findUniqueOrThrow({ where: { code: "IT" } });

  for (const [label, startYear, isCurrent] of [["2025/26", 2025, false], ["2026/27", 2026, true], ["2027/28", 2027, false]] as const) {
    await db.academicYear.upsert({
      where: { label },
      update: { isCurrent },
      create: { label, startYear, isCurrent, startsOn: new Date(Date.UTC(startYear, 8, 1)), endsOn: new Date(Date.UTC(startYear + 1, 7, 31)) },
    });
  }

  for (const h of ITALIAN_HOLIDAYS) {
    await db.holiday.upsert({
      where: { countryId_date: { countryId: italy.id, date: new Date(h.date) } },
      update: { name: h.name },
      create: { countryId: italy.id, date: new Date(h.date), name: h.name },
    });
  }

  // Regions → cities → universities
  const geo: Record<string, Record<string, string[]>> = {
    Toscana: { Firenze: ["Università degli Studi di Firenze"], Pisa: ["Università di Pisa"], Siena: ["Università degli Studi di Siena"] },
    "Emilia-Romagna": { Bologna: ["Alma Mater Studiorum – Università di Bologna"] },
    Piemonte: { Torino: ["Politecnico di Torino", "Università degli Studi di Torino"] },
    Lombardia: { Milano: ["Politecnico di Milano", "Università degli Studi di Milano"] },
    Lazio: { Roma: ["Sapienza Università di Roma"] },
    Veneto: { Padova: ["Università degli Studi di Padova"] },
  };
  for (const [regionName, cities] of Object.entries(geo)) {
    const region = await db.region.upsert({
      where: { countryId_name: { countryId: italy.id, name: regionName } },
      update: {},
      create: { countryId: italy.id, name: regionName },
    });
    for (const [cityName, unis] of Object.entries(cities)) {
      const city = await db.city.upsert({
        where: { regionId_name: { regionId: region.id, name: cityName } },
        update: {},
        create: { regionId: region.id, name: cityName },
      });
      for (const name of unis) {
        const exists = await db.university.findFirst({ where: { cityId: city.id, name } });
        if (!exists) await db.university.create({ data: { cityId: city.id, name } });
      }
    }
  }

  // Programs for 2026/27. Names are illustrative catalogue entries: an admin must verify them against the
  // universities' official course lists (/admin/programs) before they are offered to real students.
  const year = await db.academicYear.findUniqueOrThrow({ where: { label: "2026/27" } });
  const programs: Array<[string, string, "BACHELOR" | "MASTER" | "SINGLE_CYCLE", "IT" | "EN", number]> = [
    ["Università degli Studi di Firenze", "Data Science (MSc)", "MASTER", "EN", 24],
    ["Università degli Studi di Firenze", "Architettura (ciclo unico)", "SINGLE_CYCLE", "IT", 60],
    ["Alma Mater Studiorum – Università di Bologna", "Ingegneria Informatica (Laurea)", "BACHELOR", "IT", 36],
    ["Alma Mater Studiorum – Università di Bologna", "Economics (MSc)", "MASTER", "EN", 24],
    ["Politecnico di Torino", "Ingegneria Meccanica (Laurea)", "BACHELOR", "IT", 36],
    ["Politecnico di Torino", "Computer Engineering (MSc)", "MASTER", "EN", 24],
    ["Politecnico di Milano", "Management Engineering (MSc)", "MASTER", "EN", 24],
    ["Università di Pisa", "Computer Science (MSc)", "MASTER", "EN", 24],
    ["Università degli Studi di Padova", "Ingegneria Gestionale (Laurea)", "BACHELOR", "IT", 36],
    ["Sapienza Università di Roma", "Informatica (Laurea)", "BACHELOR", "IT", 36],
  ];
  for (const [uniName, name, degreeLevel, language, durationMonths] of programs) {
    const uni = await db.university.findFirstOrThrow({ where: { name: uniName } });
    const exists = await db.universityProgram.findFirst({ where: { universityId: uni.id, name, academicYearId: year.id } });
    if (!exists) await db.universityProgram.create({ data: { universityId: uni.id, academicYearId: year.id, name, degreeLevel, language, durationMonths } });
  }

  // Configurable case stages (the student journey)
  for (const [idx, s] of CASE_STAGES.entries()) {
    await db.caseStage.upsert({
      where: { key: s.key },
      update: { name: s.names[0], nameI18n: i18n(...s.names), sortOrder: idx, progressPercent: s.progress },
      create: { key: s.key, name: s.names[0], nameI18n: i18n(...s.names), sortOrder: idx, progressPercent: s.progress },
    });
  }

  // Default agency payment plan (TND, 3 decimals)
  if (!(await db.paymentPlan.findFirst({ where: { isDefault: true } }))) {
    await db.paymentPlan.create({
      data: {
        name: "Standard agency plan",
        currency: "TND",
        isDefault: true,
        items: {
          create: [
            { name: "Registration", amountMinor: 300_000, dueOffsetDays: 0, sortOrder: 1 },
            { name: "University application", amountMinor: 500_000, dueOffsetDays: 30, sortOrder: 2 },
            { name: "Visa preparation", amountMinor: 700_000, dueOffsetDays: 90, sortOrder: 3 },
            { name: "Final", amountMinor: 500_000, dueOffsetDays: 150, sortOrder: 4 },
          ],
        },
      },
    });
  }

  // Agency appointment settings & agency info
  if (!(await db.appointmentSetting.findFirst())) {
    await db.appointmentSetting.create({
      data: { workingDays: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00", slotMinutes: 30, maxPerDay: 12, blockedDates: [], minNoticeHours: 12 },
    });
  }
  await db.systemSetting.upsert({
    where: { key: "agency.info" },
    update: {},
    create: { key: "agency.info", value: { name: "Bon Ita", country: "TN", timezone: "Africa/Tunis", supportEmail: "contact@agency.test" } },
  });
  await db.systemSetting.upsert({
    where: { key: "documents.retention" },
    update: {},
    create: { key: "documents.retention", value: { retentionMonths: 60, note: "Configurable; permanent deletion requires an admin workflow." } },
  });
}
