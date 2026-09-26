"use client";

import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Charts follow the dataviz rules: one axis, one hue for a single series (the chart title names it, so no
 * legend box), thin recessive grid, tooltips on hover, and a table view for every chart (accessibility).
 * Palette slot 1 (blue) on the light surface — validated single-series, contrast handled by the table view.
 */
const SERIES = "#2a78d6";
const INK_MUTED = "#64748b";
const GRID = "#e2e8f0";

interface Datum {
  label: string;
  value: number;
}

function TableView({ rows, valueLabel }: { rows: Array<{ label: string; value: string | number }>; valueLabel: string }) {
  const t = useTranslations("admin.charts");
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("table")}</summary>
      <table className="mt-2 w-full">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 text-start font-medium" />
            <th className="py-1 text-end font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-end tabular-nums">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function BarList({ title, data, valueLabel, empty }: { title: string; data: Datum[]; valueLabel: string; empty: string }) {
  const height = Math.max(120, data.length * 34 + 30);
  return (
    <figure className="rounded-lg border border-border bg-card p-4">
      <figcaption className="mb-3 text-sm font-semibold">{title}</figcaption>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`} style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }} barCategoryGap={8}>
              <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={130} tick={{ fill: "#334155", fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
              <Tooltip cursor={{ fill: "rgba(79,70,229,0.06)" }} formatter={(v) => [String(v), valueLabel]} contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12 }} />
              <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: "#334155" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {data.length > 0 ? <TableView rows={data} valueLabel={valueLabel} /> : null}
    </figure>
  );
}

/** One line per chart: a chart never mixes currencies, so each currency gets its own small multiple. */
export function MoneyLine({ title, currency, points, empty }: { title: string; currency: string; points: Array<{ month: string; amount: number; formatted: string }>; empty: string }) {
  return (
    <figure className="rounded-lg border border-border bg-card p-4">
      <figcaption className="mb-3 text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">({currency})</span>
      </figcaption>
      {points.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div role="img" aria-label={`${title} ${currency}: ${points.map((p) => `${p.month} ${p.formatted}`).join(", ")}`} style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip formatter={(_v, _n, item) => [String((item.payload as { formatted: string }).formatted), currency]} contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12 }} />
              <Line type="monotone" dataKey="amount" stroke={SERIES} strokeWidth={2} dot={{ r: 4, stroke: "#ffffff", strokeWidth: 2, fill: SERIES }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {points.length > 0 ? <TableView rows={points.map((p) => ({ label: p.month, value: p.formatted }))} valueLabel={currency} /> : null}
    </figure>
  );
}
