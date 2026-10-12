import { z } from "zod";

import { COMPOSE_ACTIONS, TONES } from "@/lib/ai/types";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  features: z.object({
    triage: z.boolean(),
    drafts: z.boolean(),
    compose: z.boolean(),
    anomalies: z.boolean(),
  }),
});
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

export const draftReplySchema = z.object({
  threadId: objectId,
  tone: z.enum(TONES).default("friendly"),
  instructions: z.string().trim().max(300).optional(),
});

export const composeAssistSchema = z.object({
  action: z.enum(COMPOSE_ACTIONS),
  subject: z.string().max(998).optional(),
  bodyHtml: z.string().max(200_000),
  tone: z.enum(TONES).optional(),
});

export const explainIncidentSchema = z.object({
  incidentId: objectId,
  refresh: z.boolean().optional(),
});
