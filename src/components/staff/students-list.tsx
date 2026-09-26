import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EnumBadge } from "@/components/status-badge";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { localized } from "@/lib/format";
import type { AuthUser } from "@/server/authz";
import { filterOptions, listCases, parseFilters } from "@/server/staff-queries";
import { FilterBar } from "./filter-bar";

const PAGE = 25;

export async function StudentsList({ user, area, searchParams }: { user: AuthUser; area: "staff" | "admin"; searchParams: Record<string, string | string[] | undefined> }) {
  const t = await getTranslations("staff.students");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const filters = parseFilters(searchParams);
  const page = Math.max(1, Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page) || 1);
  const [{ rows, total }, options] = await Promise.all([listCases(user, filters, { take: PAGE, skip: (page - 1) * PAGE }), filterOptions(user)]);
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (k !== "page" && typeof v === "string" && v) u.set(k, v);
    u.set("page", String(p));
    return `/${area}/students?${u}`;
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("count", { n: total })} />
      <FilterBar action={`/${area}/students`} filters={filters} options={options} />
      {rows.length === 0 ? (
        <EmptyState title={t("none")} description={t("noneHint")} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("student")}</Th>
              <Th>{tc("city")}</Th>
              <Th>{tc("university")}</Th>
              <Th>{t("stage")}</Th>
              <Th>{t("flags")}</Th>
              <Th>{t("assigned")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const main = c.applications.find((a) => a.status === "ACCEPTED" || a.status === "ENROLLED") ?? c.applications.find((a) => !["REJECTED", "WITHDRAWN"].includes(a.status));
              const late = c.payments.some((p) => p.status === "LATE");
              return (
                <tr key={c.id} className="hover:bg-muted/40">
                  <Td>
                    <Link href={`/staff/students/${c.id}`} className="font-medium text-primary hover:underline">
                      {c.student.firstName} {c.student.lastName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {c.caseNumber} · {c.student.user.email}
                    </p>
                  </Td>
                  <Td>{c.student.desiredCity?.name ?? "—"}</Td>
                  <Td>{main ? main.university.name : "—"}</Td>
                  <Td>{localized(c.currentStage.nameI18n, locale, c.currentStage.name)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {c.requiresHumanReview && c.humanReviewPriority ? <EnumBadge enumName="Priority" value={c.humanReviewPriority} /> : null}
                      {c.requiresHumanReview ? <Badge tone="primary">{t("review")}</Badge> : null}
                      {c._count.instances > 0 ? <Badge tone="info">{t("toReview", { n: c._count.instances })}</Badge> : null}
                      {late ? <Badge tone="danger">{t("paymentLate")}</Badge> : null}
                    </div>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{c.assignments.map((a) => a.user.name).join(", ") || "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {total > PAGE ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={qs(page - 1)} className="text-primary hover:underline">← {tc("back")}</Link> : <span />}
          <span className="text-muted-foreground">
            {page} / {Math.ceil(total / PAGE)}
          </span>
          {page * PAGE < total ? <Link href={qs(page + 1)} className="text-primary hover:underline">{tc("next")} →</Link> : <span />}
        </div>
      ) : null}
    </>
  );
}
