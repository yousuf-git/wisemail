/**
 * Alert rule kinds, presets and wording (PRD §5.6, DBD §4.8). Client-safe: no server imports,
 * so the form, the list and the evaluator agree on what each kind means.
 */
export const ALERT_KINDS = [
  "bounce_rate",
  "complaint_rate",
  "complaint_any",
  "delivery_delay_rate",
  "connection_silent",
  "domain_status",
  "connection_status",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Rules that compare a rate of the rollup counters with a percentage threshold. */
export const RATE_KINDS = ["bounce_rate", "complaint_rate", "delivery_delay_rate"] as const;
export const isRateKind = (kind: AlertKind): kind is (typeof RATE_KINDS)[number] =>
  (RATE_KINDS as readonly string[]).includes(kind);

/** Kinds computed from `metric_rollups` (hourly buckets): the window is measured in whole hours. */
export const isRollupKind = (kind: AlertKind) => isRateKind(kind) || kind === "complaint_any";

export type KindInfo = {
  label: string;
  /** One-line description shown in the picker. */
  blurb: string;
  /** Scope fields that make sense for this kind. */
  scopes: ("connections" | "domains" | "projects")[];
  defaults: { threshold: number; windowMinutes: number; minVolume: number };
  /** Threshold unit label; `null` = the kind has no threshold. */
  unit: "%" | "complaints" | "hours" | null;
  /** Kind uses a time window. */
  windowed: boolean;
};

export const ALERT_KIND_INFO: Record<AlertKind, KindInfo> = {
  bounce_rate: {
    label: "Bounce rate",
    blurb: "Too many emails bounce (hard and soft) in a time window.",
    scopes: ["connections", "domains", "projects"],
    defaults: { threshold: 3, windowMinutes: 60, minVolume: 10 },
    unit: "%",
    windowed: true,
  },
  complaint_rate: {
    label: "Complaint rate",
    blurb: "Too many recipients mark your email as spam.",
    scopes: ["connections", "domains", "projects"],
    defaults: { threshold: 0.1, windowMinutes: 60, minVolume: 50 },
    unit: "%",
    windowed: true,
  },
  complaint_any: {
    label: "Any complaint",
    blurb: "Someone marked an email as spam. Fires on the first one.",
    scopes: ["connections", "domains", "projects"],
    defaults: { threshold: 0, windowMinutes: 60, minVolume: 0 },
    unit: "complaints",
    windowed: true,
  },
  delivery_delay_rate: {
    label: "Delivery delays",
    blurb: "A spike of emails Resend couldn't deliver right away.",
    scopes: ["connections", "domains", "projects"],
    defaults: { threshold: 10, windowMinutes: 60, minVolume: 20 },
    unit: "%",
    windowed: true,
  },
  connection_silent: {
    label: "Webhook silence",
    blurb: "No events from a Resend connection for a while. Its webhook may be gone.",
    scopes: ["connections"],
    defaults: { threshold: 0, windowMinutes: 24 * 60, minVolume: 0 },
    unit: "hours",
    windowed: true,
  },
  domain_status: {
    label: "Domain verification failed",
    blurb:
      "A domain failed verification in Resend, or its SPF or DKIM records disappeared from DNS.",
    scopes: ["connections", "domains", "projects"],
    defaults: { threshold: 0, windowMinutes: 0, minVolume: 0 },
    unit: null,
    windowed: false,
  },
  connection_status: {
    label: "Connection needs attention",
    blurb: "A Resend connection lost its key or webhook and stopped syncing.",
    scopes: ["connections"],
    defaults: { threshold: 0, windowMinutes: 0, minVolume: 0 },
    unit: null,
    windowed: false,
  },
};

export type AlertPreset = {
  key: string;
  name: string;
  kind: AlertKind;
  condition: { operator: "gt" | "lt"; threshold: number; windowMinutes: number; minVolume: number };
};

/** Starting points from PRD §5.6; everything can be edited before saving. */
export const ALERT_PRESETS: AlertPreset[] = [
  {
    key: "bounce-3",
    name: "Bounce rate over 3%",
    kind: "bounce_rate",
    condition: { operator: "gt", threshold: 3, windowMinutes: 60, minVolume: 10 },
  },
  {
    key: "complaint-any",
    name: "Any spam complaint",
    kind: "complaint_any",
    condition: { operator: "gt", threshold: 0, windowMinutes: 60, minVolume: 0 },
  },
  {
    key: "silence-24h",
    name: "No events for 24 hours",
    kind: "connection_silent",
    condition: { operator: "gt", threshold: 0, windowMinutes: 24 * 60, minVolume: 0 },
  },
  {
    key: "domain-failed",
    name: "Domain verification failed",
    kind: "domain_status",
    condition: { operator: "gt", threshold: 0, windowMinutes: 0, minVolume: 0 },
  },
  {
    key: "connection-attention",
    name: "Connection needs attention",
    kind: "connection_status",
    condition: { operator: "gt", threshold: 0, windowMinutes: 0, minVolume: 0 },
  },
];

/** Domain statuses that count as "verification failed" for `domain_status` rules. */
export const FAILING_DOMAIN_STATUSES = ["failed", "partially_failed", "temporary_failure"] as const;

export function windowLabel(minutes: number): string {
  if (minutes % 1440 === 0 && minutes >= 1440) {
    const d = minutes / 1440;
    return d === 1 ? "24 hours" : `${d} days`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "hour" : `${h} hours`;
  }
  return `${minutes} minutes`;
}

/** Plain-language summary of a rule's condition, e.g. "Bounce rate over 3% in the last hour". */
export function describeCondition(
  kind: AlertKind,
  c: { threshold: number; windowMinutes: number; minVolume?: number | null },
): string {
  const win = windowLabel(c.windowMinutes);
  const inLast = win === "hour" ? "the last hour" : `the last ${win}`;
  switch (kind) {
    case "bounce_rate":
      return `Bounce rate over ${c.threshold}% in ${inLast}`;
    case "complaint_rate":
      return `Complaint rate over ${c.threshold}% in ${inLast}`;
    case "delivery_delay_rate":
      return `Delayed deliveries over ${c.threshold}% in ${inLast}`;
    case "complaint_any":
      return c.threshold > 0
        ? `More than ${c.threshold} complaints in ${inLast}`
        : `Any complaint in ${inLast}`;
    case "connection_silent":
      return `No webhook events for ${win}`;
    case "domain_status":
      return "A domain fails verification";
    case "connection_status":
      return "A connection needs attention";
  }
}
