import type { LimitKey } from "@/lib/billing/plans";

/** Limits a platform admin may override per org (the keys `org_settings.limitOverrides` stores). */
export const OVERRIDABLE_LIMITS = [
  { key: "connections", label: "Resend connections" },
  { key: "members", label: "Members" },
  { key: "projects", label: "Projects" },
  { key: "alertRules", label: "Alert rules" },
  { key: "emailsTrackedPerMonth", label: "Tracked emails per month" },
  { key: "retentionDays", label: "Retention (days)" },
  { key: "aiCreditsPerMonth", label: "AI credits per month" },
] as const satisfies readonly { key: LimitKey; label: string }[];

export type OverridableLimitKey = (typeof OVERRIDABLE_LIMITS)[number]["key"];
export const OVERRIDABLE_KEYS = OVERRIDABLE_LIMITS.map((l) => l.key) as OverridableLimitKey[];
