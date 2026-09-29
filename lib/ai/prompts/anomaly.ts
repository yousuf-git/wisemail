import { z } from "zod";

import { UNTRUSTED_NOTICE, untrusted } from "./text";
import type { PromptBundle } from "./types";

export const ANOMALY_VERSION = "anomaly@1";

export const anomalySchema = z.object({
  explanation: z.string().min(1).max(900),
});
export type AnomalyResult = z.infer<typeof anomalySchema>;

/** Only aggregate numbers and provider error strings: no addresses, subjects or bodies. */
export type AnomalyFacts = {
  alert: { title: string; kind: string; observedValue: number; threshold: number | null };
  window: { hours: number; sent: number; delivered: number; bounced: number; complained: number };
  previous: { sent: number; bounced: number } | null;
  bounceTypes: { hard: number; soft: number };
  topBounceReasons: { reason: string; count: number }[];
  topRecipientDomains: { domain: string; bounced: number; share: number }[];
  domain: string | null;
};

const SYSTEM = `You explain a deliverability alert to a developer in 2 to 4 short sentences.
Use only the numbers provided. Name the most likely cause and one concrete next step. If the data does not point to a cause, say so plainly. No headings, no lists, no markdown.
${UNTRUSTED_NOTICE}`;

export function buildAnomalyPrompt(facts: AnomalyFacts): PromptBundle<AnomalyResult> {
  return {
    feature: "anomaly",
    version: ANOMALY_VERSION,
    tier: "main",
    system: SYSTEM,
    user: `${untrusted("facts", JSON.stringify(facts))}\nExplain this alert.`,
    schemaName: "alert_explanation",
    schema: anomalySchema,
    maxTokens: 350,
    temperature: 0.2,
    fake: { kind: "anomaly", facts: facts as unknown as Record<string, unknown> },
  };
}
