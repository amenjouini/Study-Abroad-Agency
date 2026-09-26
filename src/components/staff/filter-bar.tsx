import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import type { CaseFilters } from "@/server/staff-queries";

const DOC_STATUSES = ["NOT_STARTED", "UPLOADED", "UNDER_REVIEW", "APPROVED", "REJECTED", "NEEDS_CORRECTION", "REQUIRES_HUMAN_REVIEW"];
const VISA_STAGES = ["DOCUMENT_PREPARATION", "DOCUMENT_REVIEW", "FILE_COMPLETE", "APPOINTMENT_PENDING", "APPOINTMENT_SCHEDULED", "SUBMITTED", "PROCESSING", "ADDITIONAL_DOCUMENTS", "APPROVED", "REFUSED"];
const SCHOLARSHIP_STATUSES = ["PLANNED", "PREPARING", "SUBMITTED", "UNDER_EVALUATION", "AWARDED", "REJECTED"];
const PAYMENT_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID", "LATE"];

interface Options {
  cities: Array<{ id: string; name: string }>;
  universities: Array<{ id: string; name: string }>;
  stages: Array<{ key: string; name: string }>;
  staff: Array<{ id: string; name: string }>;
}

/** GET filter form: staff member, city, university, stage, priority, document / visa / scholarship / payment status. */
export async function FilterBar({ action, filters, options }: { action: string; filters: CaseFilters; options: Options }) {
  const t = await getTranslations("staff.filters");
  const te = await getTranslations("enums");
  const tc = await getTranslations("common");
  const sel = (name: string, label: string, value: string | undefined, items: Array<[string, string]>) => (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <Select name={name} defaultValue={value ?? ""} className="mt-1 h-9 text-sm">
        <option value="">{tc("all")}</option>
        {items.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </label>
  );
  return (
    <form action={action} method="get" className="mb-5 rounded-lg border border-border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-medium text-muted-foreground sm:col-span-2 lg:col-span-1">
          {t("search")}
          <Input name="q" defaultValue={filters.q ?? ""} className="mt-1 h-9" placeholder={t("searchPlaceholder")} />
        </label>
        {options.staff.length ? sel("staff", t("staff"), filters.staffId, options.staff.map((s) => [s.id, s.name])) : null}
        {sel("city", tc("city"), filters.cityId, options.cities.map((c) => [c.id, c.name]))}
        {sel("university", tc("university"), filters.universityId, options.universities.map((u) => [u.id, u.name]))}
        {sel("stage", t("stage"), filters.stage, options.stages.map((s) => [s.key, s.name]))}
        {sel("priority", tc("priority"), filters.priority, ["NORMAL", "HIGH", "URGENT"].map((p) => [p, te(`Priority.${p}` as never)]))}
        {sel("doc", t("documentStatus"), filters.docStatus, DOC_STATUSES.map((s) => [s, te(`RequirementStatus.${s}` as never)]))}
        {sel("visa", t("visaStatus"), filters.visaStage, VISA_STAGES.map((s) => [s, te(`VisaStage.${s}` as never)]))}
        {sel("scholarship", t("scholarshipStatus"), filters.scholarshipStatus, SCHOLARSHIP_STATUSES.map((s) => [s, te(`ScholarshipApplicationStatus.${s}` as never)]))}
        {sel("payment", t("paymentStatus"), filters.paymentStatus, PAYMENT_STATUSES.map((s) => [s, te(`PaymentStatus.${s}` as never)]))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm">
          {t("apply")}
        </Button>
        <a href={action} className="text-sm text-muted-foreground hover:underline">
          {t("reset")}
        </a>
      </div>
    </form>
  );
}
