/**
 * CSV that opens directly in Excel in Brazil: semicolons, since the decimal separator is a
 * comma, and a byte order mark, so accents survive.
 */
const BOM = "﻿";
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+([.,]\d+)?$/;

/**
 * Contact names come from strangers: a spreadsheet would run "=HYPERLINK(...)" as a formula.
 * A leading apostrophe keeps it as text.
 */
export function guardCell(value: string): string {
  return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
}

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const safe = guardCell(value);
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return BOM + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

/**
 * Applies the same protection to a file made elsewhere, without rebuilding it. Splitting a
 * quoted cell at its semicolons only makes this prefix more cells than necessary, never fewer.
 */
export function guardCsvText(csv: string): string {
  const body = csv
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((line) => line.split(";").map(guardCell).join(";"))
    .join("\r\n");
  return BOM + body;
}
