import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirementAction } from "@/app/admin/procedures/actions";
import { DependencyControls, RemoveDependency } from "@/components/admin/procedure-widgets";
import { RuleEditor, type Node } from "@/components/admin/rule-editor";
import { ConfigForm, type FieldConfig } from "@/components/config-form";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/authz";
import { requireArea } from "@/server/session";
import { loadProcedureDefinition } from "@/server/procedure-loader";

export const metadata: Metadata = { title: "Requirement rule" };

export default async function RequirementRulePage({ params }: { params: Promise<{ requirementId: string }> }) {
  const user = await requireArea("admin");
  await requirePermission(user, "document_rules.manage");
  const t = await getTranslations("admin.rules");
  const { requirementId } = await params;
  const r = await db.procedureRequirement.findUnique({
    where: { id: requirementId },
    include: { version: { include: { academicYear: true } }, dependsOn: { include: { prerequisite: true } }, prerequisiteOf: { include: { requirement: true } }, source: true },
  });
  if (!r) notFound();
  const [def, siblings, instances] = await Promise.all([
    loadProcedureDefinition(r.procedureVersionId),
    db.procedureRequirement.findMany({ where: { procedureVersionId: r.procedureVersionId, id: { not: r.id } }, orderBy: { sortOrder: "asc" } }),
    db.documentRequirementInstance.count({ where: { requirementId: r.id } }),
  ]);
  const rule = (def.requirements.find((x) => x.id === r.id)?.rule ?? null) as Node | null;
  const readOnly = r.version.status === "ARCHIVED";
  const nameI18n = (r.nameI18n ?? {}) as Record<string, string>;
  const whyI18n = (r.whyI18n ?? {}) as Record<string, string>;
  const fields: FieldConfig[] = [
    { name: "name", label: t("nameEn"), type: "text", required: true },
    { name: "nameFr", label: t("nameFr"), type: "text" },
    { name: "nameIt", label: t("nameIt"), type: "text" },
    { name: "nameAr", label: t("nameAr"), type: "text" },
    { name: "whyEn", label: t("whyEn"), type: "textarea" },
    { name: "whyFr", label: t("whyFr"), type: "textarea" },
    { name: "mandatory", label: t("mandatory"), type: "checkbox" },
    { name: "requiredFormalities", label: t("formalities"), type: "text", hint: "originalPresented, signed, stamped, translated, legalized, apostilled", wide: true },
    { name: "deadlineCode", label: t("deadlineCode"), type: "text" },
    { name: "sortOrder", label: t("sortOrder"), type: "number" },
    ...(r.kind === "HUMAN_REVIEW" ? ([{ name: "reviewReason", label: t("reviewReason"), type: "textarea" }, { name: "reviewPriority", label: t("reviewPriority"), type: "select", required: true, options: ["NORMAL", "HIGH", "URGENT"].map((x) => ({ value: x, label: x })) }] as FieldConfig[]) : []),
    { name: "sourceUrl", label: t("sourceUrl"), type: "text", wide: true },
    { name: "notes", label: t("notes"), type: "textarea" },
  ];
  return (
    <>
      <PageHeader title={r.name} description={`${r.code} · ${r.subjectType} · ${r.kind} · ${r.version.academicYear.label} v${r.version.versionNumber}`} actions={<Badge tone={r.version.status === "ACTIVE" ? "success" : "neutral"}>{r.version.status}</Badge>} />
      <p className="mb-4 text-sm"><Link className="text-primary hover:underline" href={`/admin/document-rules?version=${r.procedureVersionId}`}>← {t("back")}</Link></p>
      {readOnly ? <Alert tone="warning" className="mb-4">{t("archived")}</Alert> : null}
      {r.version.status === "ACTIVE" ? <Alert tone="warning" className="mb-4">{t("activeWarning", { n: instances })}</Alert> : null}
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>{t("applicability")}</CardTitle></CardHeader>
          <CardBody>
            <p className="mb-3 text-sm text-muted-foreground">{t("applicabilityHelp")}</p>
            <RuleEditor requirementId={r.id} initial={rule} disabled={readOnly} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("dependencies")}</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-sm">
            <p className="text-muted-foreground">{t("dependenciesHelp")}</p>
            <ul className="space-y-1">
              {r.dependsOn.map((d) => <li key={d.id} className="flex items-center justify-between rounded border border-border px-3 py-1.5"><span>{t("after")} <span className="font-medium">{d.prerequisite.name}</span></span>{!readOnly ? <RemoveDependency id={d.id} /> : null}</li>)}
              {r.dependsOn.length === 0 ? <li className="text-muted-foreground">{t("noDependencies")}</li> : null}
            </ul>
            {r.prerequisiteOf.length ? <p className="text-xs text-muted-foreground">{t("requiredBy")}: {r.prerequisiteOf.map((d) => d.requirement.name).join(", ")}</p> : null}
            {!readOnly ? <DependencyControls requirementId={r.id} options={siblings.map((s) => ({ id: s.id, label: s.name }))} /> : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("details")}</CardTitle></CardHeader>
          <CardBody>
            <ConfigForm
              action={requirementAction.bind(null, r.id)}
              fields={fields}
              initial={{ name: r.name, nameFr: nameI18n.fr ?? "", nameIt: nameI18n.it ?? "", nameAr: nameI18n.ar ?? "", whyEn: whyI18n.en ?? "", whyFr: whyI18n.fr ?? "", mandatory: r.mandatory, requiredFormalities: r.requiredFormalities.join(", "), deadlineCode: r.deadlineCode ?? "", sortOrder: String(r.sortOrder), reviewReason: r.reviewReason ?? "", reviewPriority: r.reviewPriority, sourceUrl: r.sourceUrl ?? "", notes: r.notes ?? "" }}
            />
            {r.source ? <p className="mt-3 text-xs text-muted-foreground">{t("source")}: {r.source.name}</p> : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
