"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFieldArray } from "react-hook-form";
import { useState } from "react";
import { fieldMessage, useActionRunner, useZodForm } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, CardBody, Progress } from "@/components/ui/primitives";
import { localizeSubjectLabel } from "@/lib/format";
import {
  academicSchema,
  citySchema,
  DECLARATION_STATUSES,
  DEGREE_LEVELS,
  fundingSourceSchema,
  languageSchema,
  PENSION_FUNDS,
  personalSchema,
  programChoiceSchema,
  scholarshipChoiceSchema,
  SPONSOR_STATUSES,
  sponsorSchema,
  sponsorStatusSchema,
  TEACHING_LANGUAGES,
  type AcademicInput,
  type FundingSourceInput,
  type LanguageInput,
  type PersonalInput,
  type SponsorStatusInput,
} from "@/lib/validation/domain";
import { addFundingAction, continueStepAction, generateChecklistAction, removeFundingAction, saveStepAction, type StepKey } from "./actions";

export interface WizardData {
  student: {
    firstName: string; lastName: string; phone: string; dateOfBirth: string; gender: string; passportNumber: string; passportExpiry: string; address: string;
    studyLanguage: string; languageLevel: string; languageCertificate: string; languageCertificateLevel: string; languageCertificateExpiry: string;
    bacYear: number | ""; bacSection: string; bacGrade: number | ""; desiredDegreeLevel: string; declarationStatus: string; cimeaStatus: string;
    desiredCityId: string; desiredProgramId: string; wantsScholarship: boolean | null;
  };
  degrees: Array<{ level: string; title: string; institution: string; year: number | ""; grade: string }>;
  cities: Array<{ id: string; name: string; region: string }>;
  programs: Array<{ id: string; name: string; degreeLevel: string; language: string; durationMonths: number; universityName: string; cityId: string; cityName: string }>;
  scholarships: Array<{ versionId: string; name: string; region: string; deadline: string | null }>;
  funding: Array<{
    id: string; type: string; description: string; amount: string; currency: string;
    sponsor: null | { id: string; fullName: string; relationshipCode: string; professionalStatus: string; pensionFund: string; occupation: string; fundedByDescription: string; sourceOfFunds: string };
  }>;
  relationships: Array<{ code: string }>;
  checklist: Array<{ id: string; name: string; subjectType: string; subjectLabel: string; status: string; mandatory: boolean; kind: string; reason: string }>;
  completed: boolean;
}

const TOTAL = 10;

export function Wizard({ step, savedStep, data }: { step: number; savedStep: number; data: WizardData }) {
  const t = useTranslations("student.wizard");
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("stepOf", { n: step, total: TOTAL })}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{t(`steps.${step}.title` as never)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(`steps.${step}.description` as never)}</p>
        <Progress value={(step / TOTAL) * 100} className="mt-3" label={t("title")} />
      </div>
      <Card>
        <CardBody>
          {step === 1 && <PersonalStep data={data} />}
          {step === 2 && <LanguageStep data={data} />}
          {step === 3 && <AcademicStep data={data} />}
          {step === 4 && <CityStep data={data} />}
          {step === 5 && <ProgramStep data={data} />}
          {step === 6 && <ScholarshipStep data={data} />}
          {step === 7 && <FundingStep data={data} />}
          {step === 8 && <SponsorStep data={data} />}
          {step === 9 && <SponsorStatusStep data={data} />}
          {step === 10 && <ChecklistStep data={data} />}
        </CardBody>
      </Card>
      {step < savedStep ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <Link href={`/student/onboarding?step=${savedStep}`} className="text-primary hover:underline">
            {t("backToLatest")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function StepFooter({ step, pending, disabled, label }: { step: number; pending: boolean; disabled?: boolean; label?: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      {step > 1 ? (
        <Button variant="ghost" onClick={() => router.push(`/student/onboarding?step=${step - 1}`)}>
          {t("back")}
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" disabled={pending || disabled}>
        {pending ? t("loading") : (label ?? t("continue"))}
      </Button>
    </div>
  );
}

function useStepSaver(step: number, key: StepKey) {
  const router = useRouter();
  const fromProfile = useSearchParams().get("from") === "profile";
  const runner = useActionRunner();
  // Editing from the profile page returns there; the wizard flow moves to the next step.
  const save = (input: unknown) =>
    runner.run(() => saveStepAction(key, input), (d) => router.push(fromProfile ? "/student/profile" : `/student/onboarding?step=${d.next}`));
  return { ...runner, save, step };
}

function Errors({ error }: { error: string | null }) {
  return error ? (
    <Alert tone="danger" className="mb-4">
      {error}
    </Alert>
  ) : null;
}

// ── Step 1 ─────────────────────────────────────────────────────────
function PersonalStep({ data }: { data: WizardData }) {
  const t = useTranslations("student.wizard.f");
  const tc = useTranslations("common");
  const s = data.student;
  const { save, pending, error } = useStepSaver(1, "personal");
  const { register, handleSubmit, formState: { errors } } = useZodForm<PersonalInput>(personalSchema, {
    firstName: s.firstName, lastName: s.lastName, phone: s.phone, dateOfBirth: s.dateOfBirth, gender: s.gender as "F" | "M" | "",
    passportNumber: s.passportNumber, passportExpiry: s.passportExpiry, address: s.address,
  });
  const err = (n: string) => fieldMessage(errors, n, tc);
  return (
    <form onSubmit={handleSubmit((v) => save(v))} noValidate>
      <Errors error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("firstName")} htmlFor="firstName" error={err("firstName")}><Input id="firstName" autoComplete="given-name" {...register("firstName")} /></Field>
        <Field label={t("lastName")} htmlFor="lastName" error={err("lastName")}><Input id="lastName" autoComplete="family-name" {...register("lastName")} /></Field>
        <Field label={t("phone")} htmlFor="phone" error={err("phone")}><Input id="phone" type="tel" autoComplete="tel" {...register("phone")} /></Field>
        <Field label={t("dateOfBirth")} htmlFor="dob" error={err("dateOfBirth")}><Input id="dob" type="date" {...register("dateOfBirth")} /></Field>
        <Field label={t("gender")} htmlFor="gender">
          <Select id="gender" {...register("gender")}>
            <option value="">—</option>
            <option value="F">{t("genderF")}</option>
            <option value="M">{t("genderM")}</option>
          </Select>
        </Field>
        <span className="hidden sm:block" />
        <Field label={t("passportNumber")} htmlFor="passportNumber" error={err("passportNumber")}><Input id="passportNumber" autoCapitalize="characters" {...register("passportNumber")} /></Field>
        <Field label={t("passportExpiry")} htmlFor="passportExpiry" error={err("passportExpiry")} hint={t("passportHint")}><Input id="passportExpiry" type="date" {...register("passportExpiry")} /></Field>
      </div>
      <Field label={t("address")} htmlFor="address" className="mt-4"><Textarea id="address" rows={2} {...register("address")} /></Field>
      <StepFooter step={1} pending={pending} />
    </form>
  );
}

// ── Step 2 ─────────────────────────────────────────────────────────
function LanguageStep({ data }: { data: WizardData }) {
  const t = useTranslations("student.wizard.f");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const s = data.student;
  const { save, pending, error } = useStepSaver(2, "language");
  const { register, handleSubmit, formState: { errors } } = useZodForm<LanguageInput>(languageSchema, {
    studyLanguage: (s.studyLanguage || undefined) as "IT" | "EN" | undefined,
    languageLevel: s.languageLevel, languageCertificate: s.languageCertificate, languageCertificateLevel: s.languageCertificateLevel, languageCertificateExpiry: s.languageCertificateExpiry,
  });
  return (
    <form onSubmit={handleSubmit((v) => save(v))} noValidate>
      <Errors error={error} />
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-1.5 text-sm font-medium">{t("studyLanguage")}</legend>
        {TEACHING_LANGUAGES.map((l) => (
          <label key={l} className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
            <input type="radio" value={l} className="accent-[var(--primary)]" {...register("studyLanguage")} />
            {te(`TeachingLanguage.${l}`)}
          </label>
        ))}
      </fieldset>
      {errors.studyLanguage ? <p role="alert" className="mt-1 text-xs text-danger">{tc("errors.validation")}</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t("languageLevel")} htmlFor="lvl" hint={t("languageLevelHint")}>
          <Select id="lvl" {...register("languageLevel")}>
            <option value="">—</option>
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => <option key={l}>{l}</option>)}
          </Select>
        </Field>
        <Field label={t("languageCertificate")} htmlFor="cert" hint={t("certificateHint")}><Input id="cert" {...register("languageCertificate")} /></Field>
        <Field label={t("certificateLevel")} htmlFor="certLevel"><Input id="certLevel" {...register("languageCertificateLevel")} /></Field>
        <Field label={t("certificateExpiry")} htmlFor="certExp"><Input id="certExp" type="date" {...register("languageCertificateExpiry")} /></Field>
      </div>
      <StepFooter step={2} pending={pending} />
    </form>
  );
}

// ── Step 3 ─────────────────────────────────────────────────────────
function AcademicStep({ data }: { data: WizardData }) {
  const t = useTranslations("student.wizard.f");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const s = data.student;
  const { save, pending, error } = useStepSaver(3, "academic");
  const { register, handleSubmit, control, formState: { errors } } = useZodForm<AcademicInput>(academicSchema, {
    bacYear: s.bacYear === "" ? undefined : s.bacYear,
    bacSection: s.bacSection,
    bacGrade: s.bacGrade === "" ? undefined : s.bacGrade,
    degrees: data.degrees.map((d) => ({ level: d.level as "BACHELOR", title: d.title, institution: d.institution, year: d.year === "" ? undefined : d.year, grade: d.grade })),
    declarationStatus: s.declarationStatus as "NOT_STARTED",
    cimeaStatus: s.cimeaStatus as "NOT_STARTED",
    desiredDegreeLevel: (s.desiredDegreeLevel || undefined) as "BACHELOR" | undefined,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "degrees" });
  const err = (n: string) => fieldMessage(errors, n, tc);
  return (
    <form onSubmit={handleSubmit((v) => save(v))} noValidate>
      <Errors error={error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("bacYear")} htmlFor="bacYear" error={err("bacYear")}><Input id="bacYear" type="number" inputMode="numeric" {...register("bacYear")} /></Field>
        <Field label={t("bacSection")} htmlFor="bacSection" error={err("bacSection")}><Input id="bacSection" {...register("bacSection")} /></Field>
        <Field label={t("bacGrade")} htmlFor="bacGrade" error={err("bacGrade")} hint="/ 20"><Input id="bacGrade" type="number" step="0.01" inputMode="decimal" {...register("bacGrade")} /></Field>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">{t("degrees")}</p>
        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={f.id} className="rounded-md border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("degreeLevel")}><Select {...register(`degrees.${i}.level`)}>{DEGREE_LEVELS.map((l) => <option key={l} value={l}>{te(`DegreeLevel.${l}`)}</option>)}</Select></Field>
                <Field label={t("degreeTitle")} error={err(`degrees.${i}.title`)}><Input {...register(`degrees.${i}.title`)} /></Field>
                <Field label={t("institution")}><Input {...register(`degrees.${i}.institution`)} /></Field>
                <Field label={t("year")}><Input type="number" inputMode="numeric" {...register(`degrees.${i}.year`)} /></Field>
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => remove(i)}>{tc("remove")}</Button>
            </div>
          ))}
        </div>
        {fields.length < 6 ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => append({ level: "BACHELOR", title: "", institution: "", year: undefined, grade: "" })}>
            {t("addDegree")}
          </Button>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label={t("declarationStatus")} hint={t("declarationHint")}>
          <Select {...register("declarationStatus")}>{DECLARATION_STATUSES.map((v) => <option key={v} value={v}>{te(`DeclarationStatus.${v}`)}</option>)}</Select>
        </Field>
        <Field label={t("cimeaStatus")}>
          <Select {...register("cimeaStatus")}>{DECLARATION_STATUSES.map((v) => <option key={v} value={v}>{te(`DeclarationStatus.${v}`)}</option>)}</Select>
        </Field>
      </div>
      <Field label={t("desiredDegreeLevel")} htmlFor="level" error={err("desiredDegreeLevel")} className="mt-4">
        <Select id="level" {...register("desiredDegreeLevel")}>
          <option value="">—</option>
          {DEGREE_LEVELS.map((l) => <option key={l} value={l}>{te(`DegreeLevel.${l}`)}</option>)}
        </Select>
      </Field>
      <StepFooter step={3} pending={pending} />
    </form>
  );
}

// ── Step 4 ─────────────────────────────────────────────────────────
function CityStep({ data }: { data: WizardData }) {
  const t = useTranslations("student.wizard.f");
  const tc = useTranslations("common");
  const { save, pending, error } = useStepSaver(4, "city");
  const { register, handleSubmit, formState: { errors } } = useZodForm<{ cityId: string }>(citySchema, { cityId: data.student.desiredCityId });
  return (
    <form onSubmit={handleSubmit((v) => save(v))} noValidate>
      <Errors error={error} />
      <Field label={t("city")} htmlFor="cityId" error={errors.cityId ? tc("errors.validation") : undefined}>
        <Select id="cityId" {...register("cityId")}>
          <option value="">—</option>
          {data.cities.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.region})</option>)}
        </Select>
      </Field>
      <StepFooter step={4} pending={pending} />
    </form>
  );
}

// ── Step 5 ─────────────────────────────────────────────────────────
function ProgramStep({ data }: { data: WizardData }) {
  const t = useTranslations("student.wizard.f");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const { save, pending, error } = useStepSaver(5, "program");
  const { register, handleSubmit, watch, formState: { errors } } = useZodForm<{ programId: string }>(programChoiceSchema, { programId: data.student.desiredProgramId });
  const [allCities, setAllCities] = useState(false);
  const city = data.student.desiredCityId;
  const level = data.student.desiredDegreeLevel;
  const language = data.student.studyLanguage;
  const relevant = data.programs.filter((p) => (allCities || !city || p.cityId === city) && (!level || p.degreeLevel === level) && (!language || p.language === language));
  const list = relevant.length ? relevant : data.programs;
  const selected = watch("programId");
  return (
    <form onSubmit={handleSubmit((v) => save(v))} noValidate>
      <Errors error={error} />
      {relevant.length === 0 ? <Alert tone="info" className="mb-4">{t("noMatchingPrograms")}</Alert> : null}
      <div className="space-y-2" role="radiogroup" aria-label={t("program")}>
        {list.map((p) => (
          <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${selected === p.id ? "border-primary bg-accent" : "border-input bg-card"}`}>
            <input type="radio" value={p.id} className="mt-1 accent-[var(--primary)]" {...register("programId")} />
            <span>
              <span className="block font-medium">{p.name}</span>
              <span className="block text-muted-foreground">{p.universityName} · {p.cityName}</span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                <Badge>{te(`DegreeLevel.${p.degreeLevel}` as never)}</Badge>
                <Badge tone="info">{te(`TeachingLanguage.${p.language}` as never)}</Badge>
                <Badge>{t("months", { n: p.durationMonths })}</Badge>
              </span>
            </span>
          </label>
        ))}
      </div>
      {city && !allCities ? (
        <Button variant="link" size="sm" className="mt-2" onClick={() => setAllCities(true)}>{t("showOtherCities")}</Button>
      ) : null}
      {errors.programId ? <p role="alert" className="mt-2 text-xs text-danger">{tc("errors.validation")}</p> : null}
      <p className="mt-3 text-xs text-muted-foreground">{t("programNote")}</p>
      <StepFooter step={5} pending={pending} />
    </form>
  );
}

// ── Step 6 ─────────────────────────────────────────────────────────
function ScholarshipStep({ data }: { data: WizardData }) {
  const t = useTranslations("student.wizard.f");
  const { save, pending, error } = useStepSaver(6, "scholarship");
  const [wants, setWants] = useState<boolean>(data.student.wantsScholarship ?? false);
  const [version, setVersion] = useState<string>(data.scholarships[0]?.versionId ?? "");
  const { handleSubmit } = useZodForm<{ wantsScholarship: boolean }>(scholarshipChoiceSchema, { wantsScholarship: wants });
  const tc = useTranslations("common");
  return (
    <form onSubmit={handleSubmit(() => save({ wantsScholarship: wants, scholarshipVersionId: wants && version ? version : undefined }))} noValidate>
      <Errors error={error} />
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-1.5 text-sm font-medium">{t("wantsScholarship")}</legend>
        {[true, false].map((v) => (
          <label key={String(v)} className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
            <input type="radio" name="wants" checked={wants === v} onChange={() => setWants(v)} className="accent-[var(--primary)]" />
            {v ? tc("yes") : tc("no")}
          </label>
        ))}
      </fieldset>
      {wants ? (
        data.scholarships.length ? (
          <Field label={t("scholarship")} htmlFor="sch" className="mt-4" hint={t("scholarshipHint")}>
            <Select id="sch" value={version} onChange={(e) => setVersion(e.target.value)}>
              {data.scholarships.map((s) => <option key={s.versionId} value={s.versionId}>{s.name}{s.region ? ` — ${s.region}` : ""}</option>)}
            </Select>
          </Field>
        ) : (
          <Alert tone="info" className="mt-4">{t("noScholarships")}</Alert>
        )
      ) : null}
      <StepFooter step={6} pending={pending} />
    </form>
  );
}

// ── Step 7 ─────────────────────────────────────────────────────────
function FundingStep({ data }: { data: WizardData }) {
  const t = useTranslations("student.wizard.f");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const router = useRouter();
  const add = useActionRunner();
  const cont = useActionRunner();
  const { register, handleSubmit, reset, watch, formState: { errors } } = useZodForm<FundingSourceInput>(fundingSourceSchema, { type: "SPONSOR", amount: "", currency: "EUR", description: "" });
  const currency = watch("currency");
  return (
    <div>
      <Errors error={add.error ?? cont.error} />
      <ul className="mb-4 space-y-2">
        {data.funding.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
            <span>
              <span className="font-medium">{te(`FundingSourceType.${f.type}` as never)}</span>
              {f.description ? <span className="text-muted-foreground"> — {f.description}</span> : null}
              <span className="block tabular-nums">{f.amount} {f.currency}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => add.run(() => removeFundingAction(f.id), () => router.refresh())}>{tc("remove")}</Button>
          </li>
        ))}
        {data.funding.length === 0 ? <li className="text-sm text-muted-foreground">{t("noFunding")}</li> : null}
      </ul>

      <form onSubmit={handleSubmit((v) => add.run(() => addFundingAction(v), () => { reset({ type: "SPONSOR", amount: "", currency: "EUR", description: "" }); router.refresh(); }))} noValidate className="rounded-md border border-dashed border-border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("fundingType")}>
            <Select {...register("type")}>
              {(["SPONSOR", "SCHOLARSHIP", "INSTITUTIONAL", "SELF_FUNDED", "OTHER"] as const).map((v) => <option key={v} value={v}>{te(`FundingSourceType.${v}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("description")}><Input {...register("description")} /></Field>
          <Field label={t("amount")} error={errors.amount ? tc("errors.validation") : (add.fieldErrors.amount?.[0])}><Input inputMode="decimal" placeholder={currency === "TND" ? "0.000" : "0.00"} {...register("amount")} /></Field>
          <Field label={t("currency")} hint={currency === "TND" ? t("tndHint") : undefined}>
            <Select {...register("currency")}><option value="EUR">EUR (€)</option><option value="TND">TND (DT)</option></Select>
          </Field>
        </div>
        <Button type="submit" variant="outline" size="sm" className="mt-3" disabled={add.pending}>{t("addFunding")}</Button>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">{t("fundingNote")}</p>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/student/onboarding?step=6")}>{tc("back")}</Button>
        <Button disabled={cont.pending || data.funding.length === 0} onClick={() => cont.run(() => continueStepAction(7), (d) => router.push(`/student/onboarding?step=${d.next}`))}>{tc("continue")}</Button>
      </div>
    </div>
  );
}

// ── Step 8 ─────────────────────────────────────────────────────────
function SponsorStep({ data }: { data: WizardData }) {
  const t = useTranslations("student.wizard.f");
  const tc = useTranslations("common");
  const router = useRouter();
  const cont = useActionRunner();
  const sponsorSources = data.funding.filter((f) => f.type === "SPONSOR");
  return (
    <div>
      <Errors error={cont.error} />
      {sponsorSources.length === 0 ? <Alert tone="info">{t("noSponsorNeeded")}</Alert> : null}
      <div className="space-y-4">
        {sponsorSources.map((f) => <SponsorForm key={f.id} source={f} relationships={data.relationships} />)}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/student/onboarding?step=7")}>{tc("back")}</Button>
        <Button
          disabled={cont.pending || sponsorSources.some((f) => !f.sponsor)}
          onClick={() => cont.run(() => continueStepAction(8), (d) => router.push(`/student/onboarding?step=${d.next}`))}
        >
          {tc("continue")}
        </Button>
      </div>
      {sponsorSources.some((f) => !f.sponsor) ? <p className="mt-2 text-xs text-muted-foreground">{t("saveSponsorFirst")}</p> : null}
      <span className="hidden">{t("relationship")}</span>
    </div>
  );
}

function SponsorForm({ source, relationships }: { source: WizardData["funding"][number]; relationships: Array<{ code: string }> }) {
  const t = useTranslations("student.wizard.f");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const router = useRouter();
  const runner = useActionRunner();
  const { register, handleSubmit, formState: { errors } } = useZodForm<{ fundingSourceId: string; fullName: string; relationshipCode: string }>(sponsorSchema, {
    fundingSourceId: source.id, fullName: source.sponsor?.fullName ?? "", relationshipCode: source.sponsor?.relationshipCode ?? "",
  });
  return (
    <form onSubmit={handleSubmit((v) => runner.run(() => saveStepAction("sponsor", v), () => router.refresh()))} noValidate className="rounded-md border border-border p-3">
      <Errors error={runner.error} />
      <p className="mb-3 text-sm text-muted-foreground">{source.description || te("FundingSourceType.SPONSOR")} — {source.amount} {source.currency}</p>
      <input type="hidden" {...register("fundingSourceId")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("sponsorName")} error={errors.fullName ? tc("errors.validation") : undefined}><Input {...register("fullName")} /></Field>
        <Field label={t("relationship")} error={errors.relationshipCode ? tc("errors.validation") : undefined} hint={t("relationshipHint")}>
          <Select {...register("relationshipCode")}>
            <option value="">—</option>
            {relationships.map((r) => <option key={r.code} value={r.code}>{te(`Relationship.${r.code}` as never)}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={runner.pending}>{tc("save")}</Button>
        {source.sponsor ? <Badge tone="success">{tc("saved")}</Badge> : null}
      </div>
    </form>
  );
}

// ── Step 9 ─────────────────────────────────────────────────────────
function SponsorStatusStep({ data }: { data: WizardData }) {
  const t = useTranslations("student.wizard.f");
  const tc = useTranslations("common");
  const router = useRouter();
  const cont = useActionRunner();
  const sponsors = data.funding.filter((f) => f.sponsor).map((f) => f.sponsor!);
  return (
    <div>
      <Errors error={cont.error} />
      {sponsors.length === 0 ? <Alert tone="info">{t("noSponsorNeeded")}</Alert> : null}
      <div className="space-y-4">
        {sponsors.map((s) => <SponsorStatusForm key={s.id} sponsor={s} />)}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/student/onboarding?step=8")}>{tc("back")}</Button>
        <Button
          disabled={cont.pending || sponsors.some((s) => !s.professionalStatus)}
          onClick={() => cont.run(() => continueStepAction(9), (d) => router.push(`/student/onboarding?step=${d.next}`))}
        >
          {tc("continue")}
        </Button>
      </div>
    </div>
  );
}

function SponsorStatusForm({ sponsor }: { sponsor: NonNullable<WizardData["funding"][number]["sponsor"]> }) {
  const t = useTranslations("student.wizard.f");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const router = useRouter();
  const runner = useActionRunner();
  const { register, handleSubmit, watch, formState: { errors } } = useZodForm<SponsorStatusInput>(sponsorStatusSchema, {
    sponsorId: sponsor.id,
    professionalStatus: (sponsor.professionalStatus || undefined) as SponsorStatusInput["professionalStatus"],
    pensionFund: (sponsor.pensionFund || undefined) as SponsorStatusInput["pensionFund"],
    occupation: sponsor.occupation, fundedByDescription: sponsor.fundedByDescription, sourceOfFunds: sponsor.sourceOfFunds,
  });
  const status = watch("professionalStatus");
  return (
    <form onSubmit={handleSubmit((v) => runner.run(() => saveStepAction("sponsorStatus", v), () => router.refresh()))} noValidate className="rounded-md border border-border p-3">
      <Errors error={runner.error} />
      <p className="mb-3 text-sm font-medium">{sponsor.fullName} <span className="font-normal text-muted-foreground">— {te(`Relationship.${sponsor.relationshipCode}` as never)}</span></p>
      <input type="hidden" {...register("sponsorId")} />
      <Field label={t("professionalStatus")} error={errors.professionalStatus ? tc("errors.validation") : undefined}>
        <Select {...register("professionalStatus")}>
          <option value="">—</option>
          {SPONSOR_STATUSES.map((v) => <option key={v} value={v}>{te(`SponsorProfessionalStatus.${v}`)}</option>)}
        </Select>
      </Field>
      {status === "RETIRED" ? (
        <Field label={t("pensionFund")} className="mt-3" hint={t("pensionFundHint")} error={errors.pensionFund ? tc("errors.validation") : undefined}>
          <Select {...register("pensionFund")}>
            <option value="">—</option>
            {PENSION_FUNDS.map((v) => <option key={v} value={v}>{te(`PensionFund.${v}`)}</option>)}
          </Select>
        </Field>
      ) : null}
      {status === "UNEMPLOYED_NO_INCOME" ? (
        <div className="mt-3 space-y-3">
          <Alert tone="info">{t("unemployedNote")}</Alert>
          <Field label={t("fundedBy")} error={errors.fundedByDescription ? tc("errors.validation") : undefined}><Textarea rows={2} {...register("fundedByDescription")} /></Field>
          <Field label={t("sourceOfFunds")} error={errors.sourceOfFunds ? tc("errors.validation") : undefined}><Textarea rows={2} {...register("sourceOfFunds")} /></Field>
        </div>
      ) : null}
      {status === "OTHER" ? <Alert tone="warning" className="mt-3">{t("otherNote")}</Alert> : null}
      {status === "BUSINESS_OWNER" || status === "PROFESSIONAL" ? (
        <Field label={t("occupation")} className="mt-3"><Input {...register("occupation")} /></Field>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={runner.pending}>{tc("save")}</Button>
        {sponsor.professionalStatus ? <Badge tone="success">{tc("saved")}</Badge> : null}
      </div>
    </form>
  );
}

// ── Step 10 ────────────────────────────────────────────────────────
function ChecklistStep({ data }: { data: WizardData }) {
  const t = useTranslations("student.wizard.checklist");
  const te = useTranslations("enums");
  const tc = useTranslations("common");
  const router = useRouter();
  const runner = useActionRunner();
  const items = data.checklist.filter((i) => i.kind === "DOCUMENT");
  const review = data.checklist.filter((i) => i.status === "REQUIRES_HUMAN_REVIEW");
  const groups = ["STUDENT", "SPONSOR", "APPLICATION", "FUNDING_SOURCE", "CASE"] as const;
  const generated = data.completed || items.length > 0;
  return (
    <div>
      <Errors error={runner.error} />
      {!generated ? <p className="text-sm text-muted-foreground">{t("intro")}</p> : null}
      {review.length > 0 ? (
        <Alert tone="warning" title={t("reviewTitle")} className="mb-4">
          {t("reviewBody")}
        </Alert>
      ) : null}
      {generated ? (
        <div className="space-y-4">
          {groups.map((g) => {
            const list = items.filter((i) => i.subjectType === g);
            if (list.length === 0) return null;
            return (
              <div key={g}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{te(`SubjectType.${g}` as never)}</p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {list.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>
                        {i.name}
                        {i.subjectLabel && g !== "STUDENT" ? (
                          <span className="block text-xs text-muted-foreground">
                            {localizeSubjectLabel(i.subjectLabel, (c) => (te.has(`Relationship.${c}` as never) ? te(`Relationship.${c}` as never) : undefined))}
                          </span>
                        ) : null}
                      </span>
                      {!i.mandatory ? <Badge>{tc("optional")}</Badge> : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">{t("basedOn")}</p>
        </div>
      ) : null}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/student/onboarding?step=9")}>{tc("back")}</Button>
        <Button
          disabled={runner.pending}
          onClick={() => runner.run(() => generateChecklistAction(), () => router.push("/student/documents"))}
        >
          {runner.pending ? tc("loading") : generated ? t("goToDocuments") : t("generate")}
        </Button>
      </div>
    </div>
  );
}
