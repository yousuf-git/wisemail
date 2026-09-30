/**
 * Email-safe design tokens. Mail clients ignore CSS variables, so these are the light-theme
 * values from FED §2 written out as literals. Keep in sync with `app/globals.css`; emails are
 * always light (dark-mode inversion is left to the client).
 */
export const color = {
  canvas: "#F8F7F4", // --canvas
  canvasSunken: "#F1EFEA", // --canvas-sunken
  surface: "#FFFFFF", // --surface
  ink: "#1F1E1C", // --ink
  inkSecondary: "#52504B", // --ink-secondary
  inkMuted: "#6C6B72", // --ink-muted
  line: "#ECEAE4", // --line
  accent: "#0EA5E9", // --accent
  accentInk: "#FFFFFF", // --accent-ink
  successSoft: "#E8F8F1",
  successInk: "#047857",
  warningSoft: "#FEF4E2",
  warningInk: "#B45309",
  dangerSoft: "#FDECEC",
  dangerInk: "#B91C1C",
} as const;

export const font =
  "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const mono = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
