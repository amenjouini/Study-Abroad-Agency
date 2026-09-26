"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ruleTreeAction } from "@/app/admin/procedures/actions";
import { useActionRunner } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";

type Operator = "equals" | "not_equals" | "in" | "not_in" | "gt" | "gte" | "lt" | "lte" | "between" | "before" | "after" | "exists" | "not_exists";
const OPERATORS: Operator[] = ["equals", "not_equals", "in", "not_in", "gt", "gte", "lt", "lte", "between", "before", "after", "exists", "not_exists"];

export type Node =
  | { type: "condition"; field: string; operator: Operator; value?: unknown }
  | { type: "group"; operator: "AND" | "OR" | "NOT"; children: Node[] };

/** Field paths the engine provides to rules (see the engine context). Free text is still accepted. */
const KNOWN_FIELDS = [
  "student.nationality", "student.desiredDegreeLevel", "student.studyLanguage", "student.languageCertificateLevel", "student.declarationStatus", "student.cimeaStatus", "student.degreeLevels",
  "sponsor.relationship", "sponsor.professionalStatus", "sponsor.pensionFund",
  "funding.type", "funding.amount",
  "application.status", "application.hasVisa", "program.language", "program.degreeLevel", "program.durationMonths", "university.id",
  "visa.stage", "visa.programMismatch", "visa.appointmentDate", "visa.arrivalDate",
  "scholarship.kind", "scholarship.status", "scholarship.amountEur",
  "calc.funding.shortfall", "calc.passport.satisfied", "case.today",
];

/** value <-> text: `param:key` / `field:path` references, comma-separated lists, booleans and numbers. */
function scalar(s: string): unknown {
  const v = s.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("param:")) return { $param: v.slice(6) };
  if (v.startsWith("field:")) return { $field: v.slice(6) };
  return v;
}
export function parseValue(op: Operator, text: string): unknown {
  if (op === "exists" || op === "not_exists") return undefined;
  if (op === "in" || op === "not_in" || op === "between") {
    if (text.trim().startsWith("param:")) return scalar(text);
    return text.split(",").map((x) => x.trim()).filter(Boolean).map(scalar);
  }
  return text.trim() === "" ? undefined : scalar(text);
}
function show(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.map(show).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("$param" in o) return `param:${o.$param}`;
    if ("$field" in o) return `field:${o.$field}`;
    return JSON.stringify(v);
  }
  return String(v);
}

type Draft = { type: "condition"; field: string; operator: Operator; text: string } | { type: "group"; operator: "AND" | "OR" | "NOT"; children: Draft[] };

function toDraft(n: Node): Draft {
  return n.type === "group" ? { type: "group", operator: n.operator, children: n.children.map(toDraft) } : { type: "condition", field: n.field, operator: n.operator, text: show(n.value) };
}
function fromDraft(d: Draft): Node {
  return d.type === "group" ? { type: "group", operator: d.operator, children: d.children.map(fromDraft) } : { type: "condition", field: d.field, operator: d.operator, value: parseValue(d.operator, d.text) };
}

function GroupEditor({ node, onChange, onRemove, root }: { node: Extract<Draft, { type: "group" }>; onChange: (n: Draft) => void; onRemove?: () => void; root?: boolean }) {
  const t = useTranslations("admin.rules");
  const update = (children: Draft[]) => onChange({ ...node, children });
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Select className="h-8 w-28 text-xs font-semibold" value={node.operator} onChange={(e) => onChange({ ...node, operator: e.target.value as "AND" | "OR" | "NOT" })} aria-label={t("groupOperator")}>
          <option value="AND">AND</option>
          <option value="OR">OR</option>
          <option value="NOT">NOT</option>
        </Select>
        <span className="text-xs text-muted-foreground">{node.operator === "NOT" ? t("notHint") : node.operator === "AND" ? t("andHint") : t("orHint")}</span>
        {!root && onRemove ? <Button size="sm" variant="ghost" onClick={onRemove}>{t("removeGroup")}</Button> : null}
      </div>
      <div className="space-y-2 ps-3 border-s-2 border-border">
        {node.children.map((c, i) =>
          c.type === "group" ? (
            <GroupEditor key={i} node={c} onChange={(n) => update(node.children.map((x, j) => (j === i ? n : x)))} onRemove={() => update(node.children.filter((_, j) => j !== i))} />
          ) : (
            <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_9rem_minmax(0,1.6fr)_auto]">
              <Input list="rule-fields" value={c.field} onChange={(e) => update(node.children.map((x, j) => (j === i ? { ...c, field: e.target.value } : x)))} placeholder="sponsor.relationship" aria-label={t("field")} className="h-9 font-mono text-xs" />
              <Select value={c.operator} onChange={(e) => update(node.children.map((x, j) => (j === i ? { ...c, operator: e.target.value as Operator } : x)))} className="h-9 text-xs" aria-label={t("operator")}>
                {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
              <Input value={c.text} disabled={c.operator === "exists" || c.operator === "not_exists"} onChange={(e) => update(node.children.map((x, j) => (j === i ? { ...c, text: e.target.value } : x)))} placeholder={c.operator === "in" || c.operator === "not_in" ? "FATHER, MOTHER  |  param:funding.allowed_relationships" : "value"} aria-label={t("value")} className="h-9 font-mono text-xs" />
              <Button size="sm" variant="ghost" onClick={() => update(node.children.filter((_, j) => j !== i))} aria-label={t("removeCondition")}>×</Button>
            </div>
          ),
        )}
        {node.children.length === 0 ? <p className="text-xs text-muted-foreground">{t("emptyGroup")}</p> : null}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => update([...node.children, { type: "condition", field: "", operator: "equals", text: "" }])}>{t("addCondition")}</Button>
        <Button size="sm" variant="outline" onClick={() => update([...node.children, { type: "group", operator: "AND", children: [] }])}>{t("addGroup")}</Button>
      </div>
    </div>
  );
}

/** Condition-tree editor (AND / OR / NOT groups, 13 operators). The server validates every tree again before saving. */
export function RuleEditor({ requirementId, initial, disabled }: { requirementId: string; initial: Node | null; disabled?: boolean }) {
  const t = useTranslations("admin.rules");
  const tc = useTranslations("common");
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const [tree, setTree] = useState<Draft | null>(initial ? toDraft(initial.type === "condition" ? { type: "group", operator: "AND", children: [initial] } : initial) : null);
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-3">
      <datalist id="rule-fields">{KNOWN_FIELDS.map((f) => <option key={f} value={f} />)}</datalist>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {tree === null ? (
        <Alert tone="info">{t("alwaysApplicable")}</Alert>
      ) : (
        <GroupEditor root node={tree as Extract<Draft, { type: "group" }>} onChange={(n) => { setTree(n); setSaved(false); }} />
      )}
      <p className="text-xs text-muted-foreground">{t("valueHelp")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {tree === null ? (
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => setTree({ type: "group", operator: "AND", children: [] })}>{t("addRule")}</Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => { setTree(null); setSaved(false); }}>{t("clearRule")}</Button>
        )}
        <Button size="sm" disabled={pending || disabled} onClick={() => run(() => ruleTreeAction(requirementId, tree ? fromDraft(tree) : null), () => { setSaved(true); router.refresh(); })}>{tc("save")}</Button>
        {saved ? <span className="text-sm text-success">{tc("saved")}</span> : null}
      </div>
    </div>
  );
}
