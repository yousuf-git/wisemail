/**
 * Template variables (Resend: `{{{NAME}}}`). Pure and client-safe.
 */

export const RESERVED_VARIABLES = new Set([
  "RESEND_UNSUBSCRIBE_URL",
  "FIRST_NAME",
  "LAST_NAME",
  "EMAIL",
]);

const PLACEHOLDER = /\{\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:\|[^}]*)?\}\}\}/g;

export type TemplateVariableDef = {
  key: string;
  type: string;
  fallback?: string | number | null;
};

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type VariableValues = Record<string, string | number | null | undefined>;

const isBlank = (value: unknown) => value === undefined || value === null || value === "";

export function resolveVariable(
  key: string,
  values: VariableValues,
  variables: readonly TemplateVariableDef[],
): string | null {
  const typed = values[key];
  if (!isBlank(typed)) return String(typed);
  const fallback = variables.find((v) => v.key === key)?.fallback;
  return isBlank(fallback) ? null : String(fallback);
}

export function renderTemplate(
  source: string,
  values: VariableValues,
  variables: readonly TemplateVariableDef[],
  options: { escape?: boolean } = {},
): string {
  return source.replace(PLACEHOLDER, (whole, key: string) => {
    if (RESERVED_VARIABLES.has(key.toUpperCase())) return whole;
    const value = resolveVariable(key, values, variables);
    if (value === null) return whole;
    return options.escape ? escapeHtml(value) : value;
  });
}

export function missingVariables(
  variables: readonly TemplateVariableDef[],
  values: VariableValues,
): string[] {
  return variables
    .filter((v) => resolveVariable(v.key, values, variables) === null)
    .map((v) => v.key);
}

/** Variable names used in `sources`, in order of first use, without Resend's reserved ones. */
export function extractVariables(...sources: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const match of source.matchAll(PLACEHOLDER)) {
      const key = match[1]!;
      if (!RESERVED_VARIABLES.has(key.toUpperCase())) seen.add(key);
    }
  }
  return [...seen];
}

/**
 * Preview-only rendering of Resend contact merge tags in a broadcast:
 * `{{{FIRST_NAME|there}}}` shows its fallback (or `[FIRST_NAME]`).
 */
export function previewMergeTags(html: string): string {
  return html.replace(
    /\{\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:\|([^}]*))?\}\}\}/g,
    (_whole, key: string, fallback?: string) =>
      key.toUpperCase() === "RESEND_UNSUBSCRIBE_URL"
        ? "#"
        : escapeHtml(fallback?.trim() || `[${key}]`),
  );
}
