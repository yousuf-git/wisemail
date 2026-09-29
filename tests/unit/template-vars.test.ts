import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  extractVariables,
  missingVariables,
  previewMergeTags,
  renderTemplate,
  variableTypeError,
} from "@/lib/mail/template-vars";

const defs = [
  { key: "NAME", type: "string", fallback: null },
  { key: "TEAM", type: "string", fallback: "Wisemail" },
  { key: "SEATS", type: "number", fallback: 3 },
];

describe("template variables", () => {
  it("extracts variables in order, once, without Resend's reserved placeholders", () => {
    expect(
      extractVariables(
        "<p>{{{NAME}}} {{{ TEAM }}} {{{NAME}}}</p>{{{RESEND_UNSUBSCRIBE_URL}}}",
        "Hi {{{FIRST_NAME|there}}} {{{SEATS}}}",
        null,
      ),
    ).toEqual(["NAME", "TEAM", "SEATS"]);
    expect(extractVariables("no variables {{ double }} {single}")).toEqual([]);
  });

  it("renders values, falls back to defaults and leaves unresolved placeholders visible", () => {
    expect(
      renderTemplate("Hi {{{NAME}}} from {{{TEAM}}} ({{{SEATS}}})", { NAME: "Ada" }, defs),
    ).toBe("Hi Ada from Wisemail (3)");
    expect(renderTemplate("Hi {{{NAME}}}", {}, defs)).toBe("Hi {{{NAME}}}");
    expect(renderTemplate("{{{TEAM}}}", { TEAM: "" }, defs)).toBe("Wisemail");
    expect(renderTemplate("{{{RESEND_UNSUBSCRIBE_URL}}}", {}, defs)).toBe(
      "{{{RESEND_UNSUBSCRIBE_URL}}}",
    );
  });

  it("escapes values for HTML bodies only when asked", () => {
    expect(
      renderTemplate("<p>{{{NAME}}}</p>", { NAME: '<script>"x"</script>' }, defs, { escape: true }),
    ).toBe("<p>&lt;script&gt;&quot;x&quot;&lt;/script&gt;</p>");
    expect(renderTemplate("{{{NAME}}}", { NAME: "<b>" }, defs)).toBe("<b>");
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("finds required variables that have neither a value nor a default", () => {
    expect(missingVariables(defs, {})).toEqual(["NAME"]);
    expect(missingVariables(defs, { NAME: "  " })).toEqual([]);
    expect(missingVariables(defs, { NAME: 0 })).toEqual([]);
  });

  it("checks number variables", () => {
    expect(variableTypeError({ key: "SEATS", type: "number" }, "abc")).toMatch(/number/);
    expect(variableTypeError({ key: "SEATS", type: "number" }, "12")).toBeNull();
    expect(variableTypeError({ key: "NAME", type: "string" }, "abc")).toBeNull();
    expect(variableTypeError({ key: "SEATS", type: "number" }, "")).toBeNull();
  });

  it("previews broadcast merge tags with their fallbacks and a dead unsubscribe link", () => {
    expect(
      previewMergeTags(
        '<p>Hi {{{FIRST_NAME|there}}} {{{LAST_NAME}}}</p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">x</a>',
      ),
    ).toBe('<p>Hi there [LAST_NAME]</p><a href="#">x</a>');
  });
});
