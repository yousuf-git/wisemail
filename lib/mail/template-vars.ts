/**
 * Template variables (Resend syntax: `{{{NAME}}}`). Pure and client-safe: the template editor,
 * the composer's Template mode and `sendEmail` all render with the same code, so a preview shows
 * what will be stored on our side. Resend itself renders the real email from the template id.
 */

/** Placeholders Resend fills in itself; they are not variables a sender provides. */
export const RESERVED_VARIABLES = new Set([
  "RESEND_UNSUBSCRIBE_URL",
  "FIRST_NAME",
  "LAST_NAME",
  "EMAIL",
]);

export const VARIABLE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;

const PLACEHOLDER = /\{\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*(?:\|[^}]*)?\}\}\}/g;

export type TemplateVariableDef = {
  key: string;
  type: string;
  fallback?: string | number | null;
};

/** Variable names used in `source`, in order of first use, without Resend's reserved ones. */
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

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type VariableValues = Record<string, string | number | null | undefined>;

const isBlank = (value: unknown) => value === undefined || value === null || value === "";

/** The value used for `key`: what the sender typed, else the variable's fallback. */
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

/**
 * Fills `{{{KEY}}}` placeholders. Unknown or empty variables without a fallback stay visible as
 * `{{{KEY}}}` so a preview shows what is missing. `escape` HTML-escapes values (use it for HTML
 * bodies, not for subjects or plain text).
 */
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

/** Variables the sender must fill: no typed value and no fallback. */
export function missingVariables(
  variables: readonly TemplateVariableDef[],
  values: VariableValues,
): string[] {
  return variables
    .filter((v) => resolveVariable(v.key, values, variables) === null)
    .map((v) => v.key);
}

/** Checks a typed value against the variable's type; returns an error message or null. */
export function variableTypeError(def: TemplateVariableDef, value: unknown): string | null {
  if (isBlank(value)) return null;
  if (def.type === "number" && !Number.isFinite(Number(value)))
    return `${def.key} must be a number.`;
  return null;
}

/**
 * Preview-only rendering of Resend's contact merge tags in a broadcast: `{{{FIRST_NAME|there}}}`
 * shows its fallback (or `[FIRST_NAME]`), and the unsubscribe placeholder becomes a dead link.
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
