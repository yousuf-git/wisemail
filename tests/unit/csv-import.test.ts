import { describe, expect, it } from "vitest";

import {
  buildImportRows,
  detectDelimiter,
  errorsToCsv,
  guessMapping,
  parseCsv,
} from "@/lib/audience/csv";

describe("parseCsv", () => {
  it("parses quoted fields, escaped quotes, embedded commas and newlines, CRLF and a BOM", () => {
    const text =
      '﻿email,name,note\r\n"a@x.com","Doe, Jane","said ""hi"""\r\nb@x.com,Bob,"two\nlines"\r\n';
    const parsed = parseCsv(text);
    expect(parsed.headers).toEqual(["email", "name", "note"]);
    expect(parsed.rows).toEqual([
      ["a@x.com", "Doe, Jane", 'said "hi"'],
      ["b@x.com", "Bob", "two\nlines"],
    ]);
  });

  it("detects semicolon and tab delimiters and skips blank lines", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter("just one column")).toBe(",");
    const parsed = parseCsv("email;first\n\na@x.com;Ann\n   ;  \nb@x.com;Ben");
    expect(parsed.rows).toEqual([
      ["a@x.com", "Ann"],
      ["b@x.com", "Ben"],
    ]);
  });

  it("handles a final line without a newline and an empty file", () => {
    expect(parseCsv("email\na@x.com").rows).toEqual([["a@x.com"]]);
    expect(parseCsv("")).toMatchObject({ headers: [], rows: [] });
  });
});

describe("guessMapping", () => {
  it("maps common header names, existing property keys, and never one field twice", () => {
    expect(
      guessMapping(
        ["E-mail", "First Name", "surname", "Company", "Email address", "misc"],
        ["company"],
      ),
    ).toEqual(["email", "firstName", "lastName", "property:company", "skip", "skip"]);
  });
});

describe("buildImportRows", () => {
  const props = [
    { key: "company", type: "string" as const },
    { key: "seats", type: "number" as const },
  ];
  const mapping = ["email", "firstName", "property:company", "property:seats"] as const;

  it("keeps valid rows (lowercased, typed) and reports each problem with its file line", () => {
    const rows = [
      ["Jane@Example.com", "Jane", "Acme", "5"],
      ["not-an-email", "Bob", "", ""],
      ["", "Nobody", "", ""],
      ["ok@example.com", "Ok", "Co", "many"],
      ["jane@example.com", "Again", "", ""],
      ["last@example.com", "", "", ""],
    ];
    const built = buildImportRows(rows, [...mapping], props);
    expect(built.valid.map((r) => [r.row, r.value.email])).toEqual([
      [2, "jane@example.com"],
      [7, "last@example.com"],
    ]);
    expect(built.valid[0]!.value).toEqual({
      email: "jane@example.com",
      firstName: "Jane",
      properties: { company: "Acme", seats: 5 },
    });
    expect(built.errors.map((e) => [e.row, e.message])).toEqual([
      [3, '"not-an-email" is not a valid email address.'],
      [4, "Missing email address."],
      [5, '"many" is not a number for seats.'],
      [6, "Repeated address in this file."],
    ]);
    expect(built.duplicates).toBe(1);
  });

  it("flags a property that does not exist and works with no email column mapped", () => {
    const unknown = buildImportRows([["a@x.com", "Z"]], ["email", "property:ghost"], props);
    expect(unknown.errors[0]?.message).toMatch(/ghost/);
    const none = buildImportRows([["a@x.com"]], ["skip"], props);
    expect(none.valid).toEqual([]);
    expect(none.errors[0]?.message).toBe("Missing email address.");
  });

  it("writes problems back out as CSV", () => {
    const csv = errorsToCsv([{ row: 3, email: "a,b@x.com", message: 'said "no"' }]);
    expect(csv).toBe('line,email,problem\n3,"a,b@x.com","said ""no"""');
  });
});
