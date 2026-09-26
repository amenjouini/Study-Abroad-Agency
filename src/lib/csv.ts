/**
 * CSV writer. Cells that start with = + - @ (or tab / CR) are prefixed with an apostrophe so spreadsheet
 * software never evaluates them as formulas (CSV injection).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  // UTF-8 BOM so Excel opens accented and Arabic text correctly
  return `﻿${lines.join("\r\n")}\r\n`;
}
