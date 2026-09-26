import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../src/lib/csv";

describe("CSV writer", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(null)).toBe("");
  });
  it("neutralizes spreadsheet formulas (CSV injection)", () => {
    for (const evil of ["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd"]) {
      expect(csvCell(evil).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("Ben Ali")).toBe("Ben Ali");
  });
  it("adds a BOM and CRLF line endings", () => {
    const out = toCsv(["a", "b"], [[1, "é"]]);
    expect(out.startsWith("﻿a,b\r\n")).toBe(true);
    expect(out.endsWith("1,é\r\n")).toBe(true);
  });
});
