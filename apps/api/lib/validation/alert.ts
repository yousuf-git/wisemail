import { z } from "zod";

import { ALERT_KINDS, ALERT_KIND_INFO, isRollupKind, isRateKind } from "@/lib/alerts/kinds";
import { DIGEST_OPTIONS, PREFERENCE_TYPES } from "@/lib/notifications/types";

const id = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 22:00.");

export const alertRuleInputSchema = z
  .object({
    name: z.string().trim().min(2, "Give it a name (2+ characters).").max(80),
    kind: z.enum(ALERT_KINDS, { error: "Pick what to watch." }),
    scope: z
      .object({
        connectionIds: z.array(id).max(50).default([]),
        projectIds: z.array(id).max(50).default([]),
        domainIds: z.array(id).max(50).default([]),
      })
      .default({ connectionIds: [], projectIds: [], domainIds: [] }),
    condition: z.object({
      operator: z.enum(["gt", "lt"]).default("gt"),
      threshold: z.number().min(0).max(100_000),
      windowMinutes: z
        .number()
        .int()
        .min(0)
        .max(30 * 1440),
      minVolume: z.number().int().min(0).max(1_000_000).default(0),
    }),
    channels: z
      .object({
        inApp: z.boolean().default(true),
        emailMembers: z.boolean().default(true),
        email: z.array(z.email("That email doesn't look right.")).max(5).default([]),
      })
      .default({ inApp: true, emailMembers: true, email: [] }),
    enabled: z.boolean().default(true),
  })
  .superRefine((rule, ctx) => {
    const info = ALERT_KIND_INFO[rule.kind];
    const { threshold, windowMinutes } = rule.condition;
    if (isRateKind(rule.kind) && threshold > 100) {
      ctx.addIssue({ code: "custom", path: ["condition", "threshold"], message: "Use 0 to 100." });
    }
    if (rule.kind === "complaint_any" && !Number.isInteger(threshold)) {
      ctx.addIssue({
        code: "custom",
        path: ["condition", "threshold"],
        message: "Use a whole number.",
      });
    }
    if (info.windowed && windowMinutes < 60) {
      // Rollups are hourly; a shorter window would silently be an hour.
      ctx.addIssue({
        code: "custom",
        path: ["condition", "windowMinutes"],
        message: "The shortest window is 1 hour.",
      });
    }
    if (isRollupKind(rule.kind) && windowMinutes > 7 * 1440) {
      ctx.addIssue({
        code: "custom",
        path: ["condition", "windowMinutes"],
        message: "The longest window is 7 days.",
      });
    }
    for (const key of ["connectionIds", "projectIds", "domainIds"] as const) {
      const plural = key.replace("Ids", "s") as "connections" | "projects" | "domains";
      if (rule.scope[key].length > 0 && !info.scopes.includes(plural)) {
        ctx.addIssue({
          code: "custom",
          path: ["scope", key],
          message: `${info.label} can't be limited by ${plural}.`,
        });
      }
    }
  });
export type AlertRuleInput = z.input<typeof alertRuleInputSchema>;
export type AlertRuleData = z.output<typeof alertRuleInputSchema>;

export const updateAlertRuleSchema = z.object({
  id,
  /** Optimistic concurrency: the rule's `version` when the editor opened. */
  version: z.number().int().min(0).optional(),
  rule: alertRuleInputSchema,
});
export type UpdateAlertRuleInput = z.input<typeof updateAlertRuleSchema>;

export const alertRuleIdSchema = z.object({ id });
export const setRuleEnabledSchema = z.object({ id, enabled: z.boolean() });
export const incidentIdSchema = z.object({ incidentId: id });

export const notificationPreferencesSchema = z.object({
  channels: z.partialRecord(
    z.enum(PREFERENCE_TYPES),
    z.object({ inApp: z.boolean(), email: z.boolean() }),
  ),
  quietHours: z
    .object({ start: time, end: time, timezone: z.string().min(1).max(64).optional() })
    .nullable(),
  digest: z.enum(DIGEST_OPTIONS),
});
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

export const markReadSchema = z.object({ ids: z.array(id).min(1).max(200) });
