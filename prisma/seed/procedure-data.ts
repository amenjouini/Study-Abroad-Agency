/**
 * Seed data for "Italy — Study visa (university enrollment) — Tunisia", academic year 2026/27, version 1.
 *
 * This is DATA, not application logic: it is written into the database by the seed script under a
 * procedure version, and the engine only ever reads it from there. The same module also builds an in-memory
 * ProcedureDefinition so unit tests exercise exactly the data that is seeded.
 *
 * Verified 26 September 2026 against the official sources listed in SOURCES.
 */
import type {
  DeadlineDef,
  DependencyDef,
  ProcedureDefinition,
  RequirementKind,
  RuleNode,
  SubjectType,
} from "../../src/lib/engine/types";
import { PARAM, DEADLINE, CALCULATION } from "../../src/lib/engine/constants";
import { ITALIAN_HOLIDAYS } from "./holidays";

export const DATE_VERIFIED = "2026-09-26";

export const SOURCES = {
  EMBASSY_NOTICE: {
    name: "Embassy of Italy in Tunis — 2026/27 study-visa notice (published 1 June 2026)",
    url: "https://ambtunisi.esteri.it/it/news/dall_ambasciata/2026/06/iscriversi-alle-universita-italiane-a-a-2026-2027-condizioni-per-la-concessione-del-visto-per-studio-immatricolazione-universitaria/",
  },
  EMBASSY_LEGALIZATION: {
    name: "Embassy of Italy in Tunis — translation, legalization and Declaration of Value",
    url: "https://ambtunisi.esteri.it/it/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/traduzione-e-legalizzazione-dei-documenti/",
  },
  MUR_CIRCULAR: {
    name: "MUR circular for academic years 2026/27 and 2027/28",
    url: "https://universitaly-private.cineca.it/uploads/universitaly-pubblico/Circolare_2026-2027_studenti_internazionali.pdf",
  },
  UNIVERSITALY: {
    name: "Universitaly — international students",
    url: "https://www.universitaly.it/it/studenti-stranieri",
  },
  DSU_TOSCANA: {
    name: "DSU Toscana — scholarship and accommodation 2026/27",
    url: "https://www.dsu.toscana.it/-/borsa-di-studio-e-posto-alloggio-a.a.-2026-2027",
  },
} as const;
export type SourceKey = keyof typeof SOURCES;

// ───────── Rule DSL ─────────
const and = (...children: RuleNode[]): RuleNode => ({ type: "group", operator: "AND", children });
const or = (...children: RuleNode[]): RuleNode => ({ type: "group", operator: "OR", children });
const not = (...children: RuleNode[]): RuleNode => ({ type: "group", operator: "NOT", children });
const cond = (field: string, operator: Extract<RuleNode, { type: "condition" }>["operator"], value?: unknown): RuleNode => ({
  type: "condition",
  field,
  operator,
  value,
});

const ALLOWED = { $param: PARAM.ALLOWED_RELATIONSHIPS };
const eligibleSponsor = cond("sponsor.relationship", "in", ALLOWED);
const sponsorStatus = (...statuses: string[]) => cond("sponsor.professionalStatus", "in", statuses);
const liveApplication = cond("application.status", "not_in", ["REJECTED", "WITHDRAWN"]);
const BACHELOR_LEVELS = ["BACHELOR", "SINGLE_CYCLE"];
const POSTGRAD_LEVELS = ["MASTER", "PHD", "SPECIALIZATION"];

// ───────── Parameters ─────────
export const ITALY_2026_PARAMETERS: Record<string, { value: unknown; description: string; source: SourceKey }> = {
  // Published values are stored as published: do not derive one from another (783.06 × 13 = 10,179.78 ≠ 10,179.85).
  [PARAM.MONTHLY_REFERENCE_AMOUNT]: {
    value: { amountMinor: 78306, currency: "EUR" },
    description: "Monthly reference amount",
    source: "EMBASSY_NOTICE",
  },
  [PARAM.REFERENCE_MONTHS]: { value: 13, description: "Number of months of the financial requirement", source: "EMBASSY_NOTICE" },
  [PARAM.PUBLISHED_MINIMUM_TOTAL]: {
    value: { amountMinor: 1017985, currency: "EUR" },
    description: "Published minimum total (applicable minimum)",
    source: "EMBASSY_NOTICE",
  },
  [PARAM.REFERENCE_DURATION_MONTHS]: {
    value: 12,
    description: "Programs shorter than this many months get a proportionally reduced proposal, confirmed by staff",
    source: "EMBASSY_NOTICE",
  },
  [PARAM.ALLOWED_RELATIONSHIPS]: {
    value: ["FATHER", "MOTHER", "SIBLING", "GRANDPARENT", "UNCLE_AUNT", "COUSIN"],
    description: "Family sponsors: relatives within the 4th degree (blood relatives)",
    source: "EMBASSY_NOTICE",
  },
  [PARAM.PASSPORT_MIN_VALIDITY_MONTHS]: {
    value: 15,
    description: "Passport must be valid beyond reference date + N months",
    source: "EMBASSY_NOTICE",
  },
  "bank_blocking.rules": {
    value: {
      monthlyAmount: { amountMinor: 78306, currency: "EUR" },
      months: 13,
      publishedMinimum: { amountMinor: 1017985, currency: "EUR" },
      blockingPeriodMonths: 12,
      irrevocable: true,
      branchManagerSignatureRequired: true,
      ribRequired: true,
      exceptions: [{ scholarshipKind: "ITALIAN_GOVERNMENT", atOrAbovePublishedMinimum: true }],
    },
    description: "Bank blocking (déclaration de blocage) model",
    source: "EMBASSY_NOTICE",
  },
  "language.italian_min_level": { value: "B2", description: "Italian-taught courses require Italian at B2 or above", source: "EMBASSY_NOTICE" },
  "appointment.processing_days_max": { value: 90, description: "Processing time: up to N days from dossier submission", source: "EMBASSY_NOTICE" },
  "appointment.dates_changeable": { value: false, description: "ALMAVIVA appointment dates cannot be changed", source: "EMBASSY_NOTICE" },
  "appointment.provider": { value: "ALMAVIVA", description: "Visa appointments are contacted by e-mail via the address entered in Universitaly", source: "EMBASSY_NOTICE" },
  "legalization.authorities": {
    value: {
      SECONDARY_DIPLOMA: "Tunisian Ministry of Education",
      UNIVERSITY_DEGREE: "Ministry of Higher Education and Scientific Research / rectorates",
      VOCATIONAL_TITLE: "Ministry of Employment and Vocational Training",
      HEALTH_TITLE: "Ministry of Health",
      effectiveFrom: "2026-03-30",
    },
    description: "Diploma legalization is required before the Declaration of Value (since 30 March 2026)",
    source: "EMBASSY_LEGALIZATION",
  },
};

// ───────── Deadlines ─────────
export const ITALY_2026_DEADLINES: Array<DeadlineDef & { source: SourceKey; description: string }> = [
  {
    code: DEADLINE.VISA_APPOINTMENT,
    name: "General deadline for fixing visa appointments",
    description: "Universities may set earlier per-program dates; the effective deadline is the earliest.",
    scope: "GENERAL",
    kind: "FIXED_DATE",
    fixedDate: "2026-11-30",
    dayType: "CALENDAR_DAYS",
    reminderDays: [30, 14, 7, 3, 1],
    priority: "HIGH",
    source: "EMBASSY_NOTICE",
  },
  {
    code: DEADLINE.UNIVERSITALY_ENROLLMENT,
    name: "Enrollment on Universitaly",
    description: "The Embassy revokes visas of students not enrolled by this date.",
    scope: "GENERAL",
    kind: "FIXED_DATE",
    fixedDate: "2027-01-31",
    dayType: "CALENDAR_DAYS",
    reminderDays: [30, 14, 7, 3, 1],
    priority: "URGENT",
    source: "EMBASSY_NOTICE",
  },
  {
    code: DEADLINE.PERMESSO_LEGAL,
    name: "Permesso di soggiorno — legal deadline",
    description: "Arrival date + 8 working days, Italian holidays excluded (art. 5 c.2 D.lgs. 286/1998).",
    scope: "GENERAL",
    kind: "OFFSET",
    offsetBasis: "visa.arrivalDate",
    offsetDays: 8,
    dayType: "WORKING_DAYS",
    holidayCountryCode: "IT",
    reminderDays: [3, 1],
    priority: "HIGH",
    sourceName: "Art. 5 c.2 D.lgs. 286/1998",
    source: "EMBASSY_NOTICE",
  },
  {
    code: DEADLINE.PERMESSO_CONSERVATIVE,
    name: "Permesso di soggiorno — conservative deadline shown to students",
    description: "Arrival date + 8 calendar days (Embassy notice). Students waiting for their first permesso should not leave Italy.",
    scope: "GENERAL",
    kind: "OFFSET",
    offsetBasis: "visa.arrivalDate",
    offsetDays: 8,
    dayType: "CALENDAR_DAYS",
    reminderDays: [3, 1],
    priority: "URGENT",
    source: "EMBASSY_NOTICE",
  },
];

// ───────── Requirements ─────────
type L4 = [en: string, fr: string, it: string, ar: string];
type L2 = [en: string, fr: string];

export interface RequirementSeed {
  code: string;
  kind?: RequirementKind;
  subject: SubjectType;
  mandatory?: boolean;
  rule: RuleNode | null;
  names: L4;
  why: L2;
  formalities?: string[];
  deadlineCode?: string;
  calculationKey?: string;
  reviewReason?: string;
  source: SourceKey;
  /** Document type code (see DOCUMENT_TYPES) that satisfies this requirement */
  documentType?: string;
}

const SPONSOR_WHY_FIN: L2 = [
  "We need this document to verify your sponsor's financial situation.",
  "Nous avons besoin de ce document pour vérifier la situation financière de votre garant.",
];

export const ITALY_2026_REQUIREMENTS: RequirementSeed[] = [
  // ── Student: identity & visa basics ──
  {
    code: "PASSPORT_COPY", subject: "STUDENT", rule: null, source: "EMBASSY_NOTICE", documentType: "PASSPORT",
    names: ["Passport", "Passeport", "Passaporto", "جواز السفر"],
    why: ["The visa application requires a valid passport.", "La demande de visa nécessite un passeport valide."],
  },
  {
    code: "PASSPORT_VALIDITY", kind: "CALCULATED", calculationKey: CALCULATION.PASSPORT_VALIDITY, subject: "STUDENT", rule: null, source: "EMBASSY_NOTICE",
    names: ["Passport validity", "Validité du passeport", "Validità del passaporto", "صلاحية جواز السفر"],
    why: [
      "Your passport must stay valid long enough after your visa appointment or submission date.",
      "Votre passeport doit rester valide assez longtemps après la date de rendez-vous ou de dépôt.",
    ],
  },
  {
    code: "PASSPORT_PHOTO", subject: "STUDENT", rule: null, source: "EMBASSY_NOTICE", documentType: "PHOTO",
    names: ["Passport photo (ICAO)", "Photo d'identité (format OACI)", "Foto tessera (ICAO)", "صورة شمسية (معيار ICAO)"],
    why: ["One recent photo in ICAO format is needed for the visa.", "Une photo récente au format OACI est nécessaire pour le visa."],
  },
  {
    code: "VISA_APPLICATION_FORM", subject: "APPLICATION", rule: liveApplication, source: "EMBASSY_NOTICE", documentType: "FORM",
    formalities: ["signed"], deadlineCode: DEADLINE.VISA_APPOINTMENT,
    names: ["Visa application form", "Formulaire de demande de visa", "Modulo di richiesta visto", "استمارة طلب التأشيرة"],
    why: ["The visa form must be completed and signed.", "Le formulaire de visa doit être rempli et signé."],
  },
  {
    code: "UNIVERSITALY_PREENROLMENT_LETTER", subject: "APPLICATION", rule: liveApplication, source: "UNIVERSITALY", documentType: "PREENROLMENT",
    names: ["Universitaly pre-enrolment letter", "Lettre de pré-inscription Universitaly", "Lettera di preiscrizione Universitaly", "رسالة التسجيل المسبق Universitaly"],
    why: [
      "The pre-enrolment must be validated and transmitted to the Embassy by the university.",
      "La pré-inscription doit être validée et transmise à l'Ambassade par l'université.",
    ],
  },
  // ── Student: diploma pathways ──
  ...diplomaChain("SECONDARY", BACHELOR_LEVELS, ["Secondary diploma", "Diplôme de fin d'études secondaires (baccalauréat)", "Diploma di scuola secondaria", "شهادة ختم الدروس الثانوية"], "Tunisian Ministry of Education"),
  ...diplomaChain("DEGREE", POSTGRAD_LEVELS, ["University degree", "Diplôme universitaire", "Titolo universitario", "الشهادة الجامعية"], "Ministry of Higher Education and Scientific Research / rectorate"),
  {
    code: "ACADEMIC_SUITABILITY_CERTIFICATE", subject: "STUDENT", mandatory: false, rule: null, source: "EMBASSY_NOTICE", documentType: "CERTIFICATE",
    names: ["Academic suitability certificate", "Attestation d'aptitude académique", "Certificato di idoneità accademica", "شهادة الأهلية الأكاديمية"],
    why: ["Required only where applicable to your course.", "Requis uniquement si applicable à votre cursus."],
  },
  // ── Application: language ──
  {
    code: "LANGUAGE_CERTIFICATE_IT", subject: "APPLICATION", rule: and(liveApplication, cond("program.language", "equals", "IT")), source: "EMBASSY_NOTICE", documentType: "LANGUAGE_CERT",
    names: ["Italian language certificate (B2 or above)", "Certificat de langue italienne (B2 ou plus)", "Certificato di lingua italiana (B2 o superiore)", "شهادة اللغة الإيطالية (B2 فما فوق)"],
    why: [
      "Italian-taught courses require Italian at B2 level or above. The Embassy may check this at an interview.",
      "Les cursus en italien exigent un niveau B2 ou supérieur. L'Ambassade peut le vérifier lors d'un entretien.",
    ],
  },
  {
    code: "LANGUAGE_PROOF_EN", subject: "APPLICATION", rule: and(liveApplication, cond("program.language", "equals", "EN")), source: "EMBASSY_NOTICE", documentType: "LANGUAGE_CERT",
    names: ["English language proof", "Preuve de niveau d'anglais", "Prova di conoscenza dell'inglese", "إثبات مستوى اللغة الإنجليزية"],
    why: [
      "English-taught courses require adequate proof of English. The Embassy may check this at an interview.",
      "Les cursus en anglais exigent une preuve adéquate du niveau d'anglais. L'Ambassade peut le vérifier lors d'un entretien.",
    ],
  },
  {
    code: "TRAVEL_RESERVATION", subject: "APPLICATION", rule: liveApplication, source: "EMBASSY_NOTICE", documentType: "TRAVEL",
    names: ["Return travel reservation", "Réservation de voyage (retour)", "Prenotazione di viaggio (ritorno)", "حجز السفر (العودة)"],
    why: ["A return reservation, or proof that you have your own means of travel.", "Une réservation de retour, ou la preuve de vos propres moyens de voyage."],
  },
  {
    code: "ACCOMMODATION_PROOF", subject: "APPLICATION", rule: liveApplication, source: "EMBASSY_NOTICE", documentType: "ACCOMMODATION",
    names: ["Proof of accommodation", "Justificatif d'hébergement", "Prova di alloggio", "إثبات السكن"],
    why: ["Proof of accommodation, at least for the initial period in Italy.", "Justificatif d'hébergement, au moins pour la période initiale en Italie."],
  },
  // ── Student: insurance, civil status, socio-economic ──
  {
    code: "HEALTH_INSURANCE", subject: "STUDENT", rule: null, source: "EMBASSY_NOTICE", documentType: "INSURANCE",
    names: ["Health insurance", "Assurance maladie", "Assicurazione sanitaria", "التأمين الصحي"],
    why: [
      "Accepted forms: consular declaration under a bilateral agreement; foreign policy with consular declaration; Italian policy with insurer declaration.",
      "Formes acceptées : déclaration consulaire (accord bilatéral) ; police étrangère avec déclaration consulaire ; police italienne avec déclaration de l'assureur.",
    ],
  },
  {
    code: "BIRTH_EXTRACT_FAMILY_STATUS", subject: "STUDENT", rule: null, source: "EMBASSY_NOTICE", documentType: "CIVIL_STATUS",
    formalities: ["originalPresented", "apostilled", "translated"],
    names: ["Birth extract and family status", "Extrait de naissance et situation familiale", "Estratto di nascita e stato di famiglia", "مضمون ولادة والوضعية العائلية"],
    why: ["Original document, apostilled and translated into Italian.", "Document original, apostillé et traduit en italien."],
  },
  {
    code: "SOCIO_ECONOMIC_SITUATION", subject: "STUDENT", rule: null, source: "EMBASSY_NOTICE", documentType: "SOCIO_ECONOMIC",
    names: ["Socio-economic situation document", "Document sur la situation socio-économique", "Documento sulla situazione socio-economica", "وثيقة الوضعية الاجتماعية والاقتصادية"],
    why: ["Issued by the competent Tunisian ministry.", "Délivré par le ministère tunisien compétent."],
  },
  {
    code: "MOTIVATION_LETTER", subject: "STUDENT", mandatory: false, rule: null, source: "EMBASSY_NOTICE", documentType: "LETTER",
    names: ["Motivation letter (optional)", "Lettre de motivation (facultatif)", "Lettera motivazionale (facoltativa)", "رسالة تحفيزية (اختيارية)"],
    why: ["A short letter explaining your study plan can support your file.", "Une courte lettre expliquant votre projet d'études peut appuyer votre dossier."],
  },
  // ── Financial ──
  {
    code: "BANK_BLOCKING_LETTER", subject: "STUDENT", source: "EMBASSY_NOTICE", documentType: "BANK_BLOCKING",
    // Waived only for an Italian government scholarship at or above the published minimum — not for every scholarship.
    rule: not(and(cond("scholarship.kind", "equals", "ITALIAN_GOVERNMENT"), cond("scholarship.amountEur", "gte", { $param: PARAM.PUBLISHED_MINIMUM_TOTAL }))),
    formalities: ["originalPresented", "signed", "stamped"],
    names: ["Bank blocking letter (déclaration de blocage)", "Déclaration de blocage bancaire", "Dichiarazione di blocco bancario", "شهادة تجميد المبلغ البنكي"],
    why: [
      "The blocked amount must cover the published minimum. The original must be signed and stamped by the bank; the branch manager's signature and a RIB are required.",
      "Le montant bloqué doit couvrir le minimum publié. L'original doit être signé et cacheté par la banque ; la signature du directeur d'agence et un RIB sont requis.",
    ],
  },
  {
    code: "FUNDING_SUFFICIENCY", kind: "CALCULATED", calculationKey: CALCULATION.FUNDING_SUFFICIENCY, subject: "STUDENT", rule: null, source: "EMBASSY_NOTICE",
    names: ["Proof of financial means", "Justificatif de moyens financiers", "Prova di mezzi finanziari", "إثبات الموارد المالية"],
    why: [
      "Your funding sources must cover the financial requirement published by the Embassy.",
      "Vos sources de financement doivent couvrir le montant exigé publié par l'Ambassade.",
    ],
  },
  // ── Sponsor documents (eligible relatives only) ──
  ...sponsorDocs(),
  // ── Funding-source documents ──
  {
    code: "SCHOLARSHIP_AWARD_LETTER", subject: "FUNDING_SOURCE", rule: cond("funding.type", "equals", "SCHOLARSHIP"), source: "EMBASSY_NOTICE", documentType: "AWARD_LETTER",
    names: ["Scholarship award letter", "Attestation d'octroi de bourse", "Lettera di assegnazione della borsa", "شهادة منحة دراسية"],
    why: ["Proof of the scholarship and its amount.", "Preuve de la bourse et de son montant."],
  },
  {
    code: "INSTITUTIONAL_FUNDING_PROOF", subject: "FUNDING_SOURCE", rule: cond("funding.type", "equals", "INSTITUTIONAL"), source: "EMBASSY_NOTICE", documentType: "AWARD_LETTER",
    names: ["Institutional funding proof", "Preuve de financement institutionnel", "Prova di finanziamento istituzionale", "إثبات تمويل مؤسسي"],
    why: ["Institutional funding must come from a body the Embassy considers reliable.", "Le financement institutionnel doit provenir d'un organisme jugé fiable par l'Ambassade."],
  },
  // ── Human review ──
  {
    code: "SPONSOR_RELATIONSHIP_REVIEW", kind: "HUMAN_REVIEW", subject: "SPONSOR", source: "EMBASSY_NOTICE",
    rule: not(cond("sponsor.relationship", "in", ALLOWED)),
    reviewReason: "Sponsor relationship is unclear or outside the relatives allowed by the procedure version",
    names: ["Sponsor relationship review", "Vérification du lien avec le garant", "Verifica del rapporto con il garante", "مراجعة صلة القرابة بالكفيل"],
    why: ["Our team needs to check this sponsor with you.", "Notre équipe doit vérifier ce garant avec vous."],
  },
  {
    code: "SPONSOR_STATUS_REVIEW", kind: "HUMAN_REVIEW", subject: "SPONSOR", source: "EMBASSY_NOTICE",
    rule: or(cond("sponsor.professionalStatus", "not_exists"), sponsorStatus("OTHER", "UNEMPLOYED_NO_INCOME")),
    reviewReason: "Sponsor professional status is unknown, other, or without income",
    names: ["Sponsor situation review", "Vérification de la situation du garant", "Verifica della situazione del garante", "مراجعة وضعية الكفيل"],
    why: ["Our team needs to understand who funds your studies.", "Notre équipe doit comprendre qui finance vos études."],
  },
  {
    code: "PENSION_FUND_REVIEW", kind: "HUMAN_REVIEW", subject: "SPONSOR", source: "EMBASSY_NOTICE",
    rule: and(sponsorStatus("RETIRED"), cond("sponsor.pensionFund", "not_exists")),
    reviewReason: "Retired sponsor: pension fund not stated",
    names: ["Pension fund check", "Vérification de la caisse de retraite", "Verifica della cassa pensionistica", "التحقق من صندوق التقاعد"],
    why: ["We need to know which pension fund pays the pension.", "Nous devons connaître la caisse qui verse la pension."],
  },
  {
    code: "SELF_FUNDED_REVIEW", kind: "HUMAN_REVIEW", subject: "FUNDING_SOURCE", source: "EMBASSY_NOTICE",
    rule: cond("funding.type", "equals", "SELF_FUNDED"),
    reviewReason: "Self-funding is not listed in the 2026/27 Embassy text",
    names: ["Self-funding review", "Vérification du financement personnel", "Verifica dell'autofinanziamento", "مراجعة التمويل الذاتي"],
    why: ["Self-funding is not listed in the Embassy notice; our team will check your situation.", "Le financement personnel n'est pas prévu dans l'avis de l'Ambassade ; notre équipe examinera votre situation."],
  },
  {
    code: "VISA_PROGRAM_MISMATCH_REVIEW", kind: "HUMAN_REVIEW", subject: "APPLICATION", source: "EMBASSY_NOTICE",
    rule: cond("visa.programMismatch", "equals", true),
    reviewReason:
      "The visa program differs from the program the student intends to enrol in. Enrolling in a different course requires returning to Tunisia for a new visa.",
    names: ["Course / visa consistency check", "Cohérence cursus / visa", "Coerenza corso / visto", "التوافق بين المسار والتأشيرة"],
    why: [
      "Your visa is linked to a specific course. Enrolling in a different course would require a new visa from Tunisia. Please contact us before changing.",
      "Votre visa est lié à un cursus précis. S'inscrire dans un autre cursus nécessiterait un nouveau visa depuis la Tunisie. Contactez-nous avant tout changement.",
    ],
  },
];

function diplomaChain(prefix: "SECONDARY" | "DEGREE", levels: string[], title: L4, authority: string): RequirementSeed[] {
  const rule = cond("student.desiredDegreeLevel", "in", levels);
  const [en, fr, it, ar] = title;
  return [
    {
      code: `${prefix}_DIPLOMA`, subject: "STUDENT", rule, source: "EMBASSY_NOTICE", documentType: "DIPLOMA", formalities: ["originalPresented"],
      names: [`${en} (original + copy)`, `${fr} (original + copie)`, `${it} (originale + copia)`, `${ar} (أصل + نسخة)`],
      why: [`Original and copy of your ${en.toLowerCase()}.`, `Original et copie de votre ${fr.toLowerCase()}.`],
    },
    {
      code: `${prefix}_LEGALIZATION`, subject: "STUDENT", rule, source: "EMBASSY_LEGALIZATION", documentType: "LEGALIZATION", formalities: ["legalized"],
      names: [`${en} — legalization`, `${fr} — légalisation`, `${it} — legalizzazione`, `${ar} — التصديق`],
      why: [`Legalization by: ${authority}. Required before the Declaration of Value.`, `Légalisation par : ${authority}. Requise avant la Déclaration de valeur.`],
    },
    {
      code: `${prefix}_TRANSLATION`, subject: "STUDENT", rule, source: "EMBASSY_LEGALIZATION", documentType: "TRANSLATION", formalities: ["translated"],
      names: [`${en} — Italian translation`, `${fr} — traduction en italien`, `${it} — traduzione in italiano`, `${ar} — الترجمة إلى الإيطالية`],
      why: ["All documents must be translated into Italian.", "Tous les documents doivent être traduits en italien."],
    },
    {
      code: `${prefix}_APOSTILLE`, subject: "STUDENT", rule, source: "EMBASSY_LEGALIZATION", documentType: "APOSTILLE", formalities: ["apostilled"],
      names: [`${en} — apostille`, `${fr} — apostille`, `${it} — apostille`, `${ar} — الأبوستيل`],
      why: ["Documents must be apostilled.", "Les documents doivent être apostillés."],
    },
    {
      code: `${prefix}_VALUE_DECLARATION`, subject: "STUDENT", rule, source: "EMBASSY_LEGALIZATION", documentType: "VALUE_DECLARATION",
      names: [`${en} — Declaration of Value or CIMEA`, `${fr} — Déclaration de valeur ou CIMEA`, `${it} — Dichiarazione di valore o CIMEA`, `${ar} — إعلان القيمة أو CIMEA`],
      why: ["A Declaration of Value or a CIMEA certificate for your qualification.", "Une Déclaration de valeur ou un certificat CIMEA pour votre diplôme."],
    },
  ];
}

function sponsorDocs(): RequirementSeed[] {
  const eligible = eligibleSponsor;
  const withStatus = (...s: string[]) => and(eligible, sponsorStatus(...s));
  const base = (
    code: string,
    rule: RuleNode,
    names: L4,
    documentType: string,
    formalities: string[] = [],
    why: L2 = SPONSOR_WHY_FIN,
  ): RequirementSeed => ({ code, subject: "SPONSOR", rule, names, why, documentType, formalities, source: "EMBASSY_NOTICE" });
  const bankStatementStatuses = ["EMPLOYEE", "RETIRED", "BUSINESS_OWNER", "PROFESSIONAL"];
  return [
    base("SPONSOR_ID", eligible, ["Sponsor identity document", "Pièce d'identité du garant", "Documento d'identità del garante", "وثيقة هوية الكفيل"], "IDENTITY"),
    base(
      "RELATIONSHIP_PROOF", eligible,
      ["Proof of relationship with the sponsor", "Preuve du lien de parenté avec le garant", "Prova del rapporto di parentela", "إثبات صلة القرابة"],
      "CIVIL_STATUS", ["originalPresented", "translated", "legalized", "apostilled"],
      [
        "Original civil-status records proving the relationship, translated into Italian, legalized and apostilled.",
        "Actes d'état civil originaux prouvant le lien, traduits en italien, légalisés et apostillés.",
      ],
    ),
    base("EMPLOYMENT_CERTIFICATE", withStatus("EMPLOYEE"), ["Employment certificate", "Attestation de travail", "Certificato di lavoro", "شهادة عمل"], "EMPLOYMENT"),
    base("PAYSLIPS_LAST_6", withStatus("EMPLOYEE"), ["Last 6 payslips", "6 derniers bulletins de paie", "Ultime 6 buste paga", "آخر 6 كشوف أجور"], "PAYSLIPS"),
    base("CNSS_CERTIFICATE", withStatus("EMPLOYEE"), ["CNSS certificate", "Attestation CNSS", "Certificato CNSS", "شهادة الصندوق الوطني للضمان الاجتماعي"], "SOCIAL_SECURITY"),
    base("RETIREMENT_CERTIFICATE", withStatus("RETIRED"), ["Retirement certificate", "Attestation de retraite", "Certificato di pensionamento", "شهادة تقاعد"], "PENSION"),
    base("PENSION_DOCS_CNSS", and(withStatus("RETIRED"), cond("sponsor.pensionFund", "equals", "CNSS")), ["Pension documentation (CNSS)", "Justificatifs de pension (CNSS)", "Documentazione pensione (CNSS)", "وثائق الجراية (CNSS)"], "PENSION"),
    base("PENSION_DOCS_CNRPS", and(withStatus("RETIRED"), cond("sponsor.pensionFund", "equals", "CNRPS")), ["Pension documentation (CNRPS)", "Justificatifs de pension (CNRPS)", "Documentazione pensione (CNRPS)", "وثائق الجراية (CNRPS)"], "PENSION"),
    base("PENSION_DOCS_OTHER", and(withStatus("RETIRED"), cond("sponsor.pensionFund", "equals", "OTHER")), ["Pension documentation (other fund)", "Justificatifs de pension (autre caisse)", "Documentazione pensione (altra cassa)", "وثائق الجراية (صندوق آخر)"], "PENSION"),
    base("BUSINESS_REGISTRATION", withStatus("BUSINESS_OWNER"), ["Patente or business registration", "Patente ou immatriculation de l'activité", "Patente o registrazione dell'attività", "الباتيندة أو تسجيل النشاط"], "BUSINESS"),
    base("COMMERCIAL_REGISTRY_EXTRACT", withStatus("BUSINESS_OWNER"), ["Commercial registry extract", "Extrait du registre de commerce", "Estratto del registro delle imprese", "مضمون من السجل التجاري"], "BUSINESS"),
    base("COMPANY_DOCUMENTS", withStatus("BUSINESS_OWNER"), ["Company documents", "Documents de la société", "Documenti della società", "وثائق الشركة"], "BUSINESS"),
    base("COMPANY_BANK_STATEMENTS", withStatus("BUSINESS_OWNER"), ["Company bank statements", "Relevés bancaires de la société", "Estratti conto della società", "كشوف حساب الشركة"], "BANK_STATEMENT"),
    base("TAX_DOCUMENTATION", withStatus("BUSINESS_OWNER", "PROFESSIONAL"), ["Tax documentation", "Documents fiscaux", "Documentazione fiscale", "الوثائق الجبائية"], "TAX"),
    base("PROFESSIONAL_REGISTRATION", withStatus("PROFESSIONAL"), ["Professional registration", "Inscription à l'ordre professionnel", "Iscrizione all'albo professionale", "التسجيل المهني"], "BUSINESS"),
    base("BANK_STATEMENT_6_MONTHS", withStatus(...bankStatementStatuses), ["Bank statements (6 months)", "Relevés bancaires (6 mois)", "Estratti conto (6 mesi)", "كشوف الحساب البنكي (6 أشهر)"], "BANK_STATEMENT", ["originalPresented", "stamped"]),
  ];
}

export const ITALY_2026_DEPENDENCIES: DependencyDef[] = [
  ...["SECONDARY", "DEGREE"].flatMap((p) => [
    { requirementCode: `${p}_LEGALIZATION`, prerequisiteCode: `${p}_DIPLOMA` },
    { requirementCode: `${p}_TRANSLATION`, prerequisiteCode: `${p}_LEGALIZATION` },
    { requirementCode: `${p}_APOSTILLE`, prerequisiteCode: `${p}_TRANSLATION` },
    { requirementCode: `${p}_VALUE_DECLARATION`, prerequisiteCode: `${p}_APOSTILLE` },
  ]),
];

export const DOCUMENT_TYPES: Array<{ code: string; name: string }> = [
  ["PASSPORT", "Passport"], ["PHOTO", "Photograph"], ["FORM", "Form"], ["PREENROLMENT", "Pre-enrolment letter"],
  ["DIPLOMA", "Diploma / degree"], ["LEGALIZATION", "Legalization"], ["TRANSLATION", "Translation"], ["APOSTILLE", "Apostille"],
  ["VALUE_DECLARATION", "Declaration of Value / CIMEA"], ["CERTIFICATE", "Certificate"], ["LANGUAGE_CERT", "Language certificate"],
  ["TRAVEL", "Travel reservation"], ["ACCOMMODATION", "Accommodation proof"], ["INSURANCE", "Health insurance"],
  ["CIVIL_STATUS", "Civil-status record"], ["SOCIO_ECONOMIC", "Socio-economic document"], ["LETTER", "Letter"],
  ["BANK_BLOCKING", "Bank blocking letter"], ["AWARD_LETTER", "Award letter"], ["IDENTITY", "Identity document"],
  ["EMPLOYMENT", "Employment document"], ["PAYSLIPS", "Payslips"], ["SOCIAL_SECURITY", "Social security certificate"],
  ["PENSION", "Pension document"], ["BUSINESS", "Business / professional document"], ["BANK_STATEMENT", "Bank statement"], ["TAX", "Tax document"],
].map(([code, name]) => ({ code, name }));

export const SPONSOR_RELATIONSHIPS: Array<{ code: string; name: string; fr: string; kinship: number | null }> = [
  { code: "FATHER", name: "Father", fr: "Père", kinship: 1 },
  { code: "MOTHER", name: "Mother", fr: "Mère", kinship: 1 },
  { code: "SIBLING", name: "Brother / sister", fr: "Frère / sœur", kinship: 2 },
  { code: "GRANDPARENT", name: "Grandparent", fr: "Grand-parent", kinship: 2 },
  { code: "UNCLE_AUNT", name: "Uncle / aunt", fr: "Oncle / tante", kinship: 3 },
  { code: "COUSIN", name: "Cousin (blood)", fr: "Cousin(e) (lien du sang)", kinship: 4 },
  { code: "SPOUSE", name: "Spouse", fr: "Conjoint(e)", kinship: null },
  { code: "FRIEND", name: "Family friend", fr: "Ami de la famille", kinship: null },
  { code: "OTHER", name: "Other", fr: "Autre", kinship: null },
];

// ───────── In-memory definition for tests and tooling ─────────
export function italy2026Definition(): ProcedureDefinition {
  return {
    versionId: "italy-2026-v1",
    academicYear: "2026/27",
    parameters: Object.fromEntries(Object.entries(ITALY_2026_PARAMETERS).map(([k, v]) => [k, v.value])),
    requirements: ITALY_2026_REQUIREMENTS.map((r, i) => ({
      id: r.code,
      code: r.code,
      kind: r.kind ?? "DOCUMENT",
      subjectType: r.subject,
      name: r.names[0],
      mandatory: r.mandatory ?? true,
      calculationKey: r.calculationKey ?? null,
      reviewReason: r.reviewReason ?? null,
      deadlineCode: r.deadlineCode ?? null,
      sortOrder: i,
      rule: r.rule,
    })),
    dependencies: ITALY_2026_DEPENDENCIES,
    deadlines: ITALY_2026_DEADLINES.map((d) => ({
      ...d,
      sourceName: d.sourceName ?? SOURCES[d.source].name,
      sourceUrl: d.sourceName ? null : SOURCES[d.source].url,
    })),
    holidays: { IT: ITALIAN_HOLIDAYS.map((h) => h.date) },
  };
}
