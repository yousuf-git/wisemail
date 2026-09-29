/**
 * CSV parsing and import validation, run in the browser before anything is sent (PRD §5.9).
 * Pure and dependency-free: RFC 4180 quoting, `,` `;` or tab delimiters, BOM and CRLF.
 */
import { isValidEmail } from "@/lib/mail/address";
import type { ImportRowError, ImportRowInput } from "@/lib/dto/audience";

export type ParsedCsv = { headers: string[]; rows: string[][]; delimiter: string };

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  const best = counts.sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : ",";
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      records.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows, delimiter };
}

/** Where a CSV column goes. `property:<key>` maps to a contact property; `skip` ignores it. */
export type ColumnTarget = "skip" | "email" | "firstName" | "lastName" | `property:${string}`;

const HEADER_GUESS: [RegExp, ColumnTarget][] = [
  [/^e-?mail( address)?$/i, "email"],
  [/^(first[ _-]?name|given[ _-]?name|firstname)$/i, "firstName"],
  [/^(last[ _-]?name|family[ _-]?name|surname|lastname)$/i, "lastName"],
];

/** Suggests a target per header from its name (and from property keys the account already has). */
export function guessMapping(headers: string[], propertyKeys: string[]): ColumnTarget[] {
  const used = new Set<ColumnTarget>();
  return headers.map((header) => {
    let target: ColumnTarget =
      HEADER_GUESS.find(([re]) => re.test(header.trim()))?.[1] ??
      (propertyKeys.find((k) => k.toLowerCase() === header.trim().toLowerCase())
        ? (`property:${propertyKeys.find((k) => k.toLowerCase() === header.trim().toLowerCase())}` as ColumnTarget)
        : "skip");
    if (target !== "skip" && used.has(target)) target = "skip";
    used.add(target);
    return target;
  });
}

export type PropertyDef = { key: string; type: "string" | "number" };

export type BuiltRows = {
  valid: { row: number; value: ImportRowInput }[];
  errors: ImportRowError[];
  duplicates: number;
};

/**
 * Turns CSV records into import rows using the column mapping. `row` is the 1-based line number
 * in the file (header is line 1). Invalid emails, wrong property types and repeated addresses
 * are reported per row; nothing invalid is ever sent to the server.
 */
export function buildImportRows(
  rows: string[][],
  mapping: ColumnTarget[],
  properties: PropertyDef[],
): BuiltRows {
  const valid: BuiltRows["valid"] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  const propertyByKey = new Map(properties.map((p) => [p.key, p]));

  rows.forEach((cells, index) => {
    const line = index + 2;
    const value: ImportRowInput = { email: "" };
    const props: Record<string, string | number> = {};
    let problem: string | null = null;

    mapping.forEach((target, col) => {
      const raw = (cells[col] ?? "").trim();
      if (target === "skip" || raw === "") return;
      if (target === "email") value.email = raw.toLowerCase();
      else if (target === "firstName") value.firstName = raw;
      else if (target === "lastName") value.lastName = raw;
      else {
        const key = target.slice("property:".length);
        const def = propertyByKey.get(key);
        if (!def) problem ??= `Unknown property "${key}".`;
        else if (def.type === "number") {
          const n = Number(raw);
          if (!Number.isFinite(n)) problem ??= `"${raw}" is not a number for ${key}.`;
          else props[key] = n;
        } else props[key] = raw;
      }
    });

    if (!value.email) problem ??= "Missing email address.";
    else if (!isValidEmail(value.email))
      problem ??= `"${value.email}" is not a valid email address.`;
    if (!problem && seen.has(value.email)) {
      duplicates++;
      errors.push({ row: line, email: value.email, message: "Repeated address in this file." });
      return;
    }
    if (problem) {
      errors.push({ row: line, email: value.email, message: problem });
      return;
    }
    seen.add(value.email);
    if (Object.keys(props).length) value.properties = props;
    valid.push({ row: line, value });
  });
  return { valid, errors, duplicates };
}

/** The per-row problems as a CSV the person can fix and import again. */
export function errorsToCsv(errors: ImportRowError[]): string {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    "line,email,problem",
    ...errors.map((e) => [e.row, e.email, e.message].map(cell).join(",")),
  ].join("\n");
}
