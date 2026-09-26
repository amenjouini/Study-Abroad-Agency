import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BarList, MoneyLine } from "@/components/charts";
import { PageHeader, Stat } from "@/components/ui/primitives";
import { decimalsFor, formatMoney, money } from "@/lib/money";
import { getAdminAnalytics } from "@/server/analytics";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const user = await requireArea("admin");
  const locale = await getLocale();
  const t = await getTranslations("admin.dashboard");
  const te = await getTranslations("enums");
  const a = await getAdminAnalytics(user, locale);
  const k = a.kpis;
  const empty = t("noData");
  const docs = a.docStatus.map((d) => ({ label: te(`RequirementStatus.${d.label}` as never), value: d.value }));
  const languages = a.byLanguage.map((d) => ({ label: d.label === "IT" || d.label === "EN" ? te(`TeachingLanguage.${d.label}`) : d.label, value: d.value }));

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("students")} value={k.students} />
        <Stat label={t("activeCases")} value={k.activeCases} />
        <Stat label={t("newLeads")} value={k.leadsNew} hint={t("last30")} />
        <Stat label={t("conversion")} value={k.conversionRate === null ? "—" : `${k.conversionRate}%`} hint={t("conversionHint")} />
        <Stat label={t("pendingDocs")} value={k.pendingDocs} />
        <Stat label={t("rejectedDocs")} value={k.rejectedDocs} />
        <Stat label={t("humanReview")} value={k.humanReview} />
        <Stat
          label={t("pendingPayments")}
          value={k.pendingPayments}
          hint={k.pendingByCurrency.length ? k.pendingByCurrency.map((p) => formatMoney(money(p.minor, p.currency), locale)).join(" · ") : undefined}
        />
        <Stat label={t("appointments")} value={k.upcomingAppts} hint={t("upcoming")} />
        <Stat label={t("visaCases")} value={k.visaCases} />
        <Stat label={t("scholarshipCases")} value={k.scholarshipCases} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title={t("byCity")} data={a.byCity} valueLabel={t("students")} empty={empty} />
        <BarList title={t("byUniversity")} data={a.byUniversity} valueLabel={t("students")} empty={empty} />
        <BarList title={t("byLanguage")} data={languages} valueLabel={t("students")} empty={empty} />
        <BarList title={t("byStage")} data={a.byStage} valueLabel={t("cases")} empty={empty} />
        <BarList title={t("docStatus")} data={docs} valueLabel={t("documents")} empty={empty} />
        <BarList title={t("workload")} data={a.workload} valueLabel={t("cases")} empty={empty} />
        {a.revenueSeries.length === 0 ? (
          <MoneyLine title={t("revenue")} currency="—" points={[]} empty={empty} />
        ) : (
          a.revenueSeries.map((s) => (
            <MoneyLine
              key={s.currency}
              title={t("revenue")}
              currency={s.currency}
              empty={empty}
              points={s.points.map((p) => ({ month: p.month, amount: p.minor / 10 ** decimalsFor(s.currency), formatted: formatMoney(money(p.minor, s.currency), locale) }))}
            />
          ))
        )}
      </div>
    </>
  );
}
