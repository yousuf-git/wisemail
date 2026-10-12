import { z } from "zod";

import { TRIAGE_CATEGORIES, TRIAGE_PRIORITIES, TRIAGE_SENTIMENTS } from "@/lib/ai/types";
import { prepareBody, truncateText, untrusted, UNTRUSTED_NOTICE } from "./text";
import type { PromptBundle } from "./types";

export const TRIAGE_VERSION = "triage@1";
export const TRIAGE_BODY_LIMIT = 2_000;

export const triageSchema = z.object({
  category: z.enum(TRIAGE_CATEGORIES),
  priority: z.enum(TRIAGE_PRIORITIES),
  sentiment: z.enum(TRIAGE_SENTIMENTS),
  summary: z.string().min(1).max(200),
});
export type TriageResult = z.infer<typeof triageSchema>;

const SYSTEM = `You triage inbound email for a team inbox. Classify one message.
- category: support (a customer needs help), sales (a lead or partnership), billing (invoices, payments, refunds), spam (unsolicited or promotional), auto_reply (out-of-office, delivery notices, automated receipts), other.
- priority: urgent (outage, legal, money at risk, angry escalation), high (blocked customer, deadline), normal, low (FYI, newsletters).
- sentiment: the sender's tone toward us.
- summary: one plain sentence, at most 25 words, in the language of the message. No greeting, no quotes.
Reply with JSON only.
${UNTRUSTED_NOTICE}`;

/** Only the newest text of one message is sent: subject, sender address, trimmed body. */
export function buildTriagePrompt(input: {
  subject: string;
  fromAddress: string;
  text?: string | null;
  html?: string | null;
}): PromptBundle<TriageResult> {
  const body = prepareBody({ text: input.text, html: input.html }, TRIAGE_BODY_LIMIT);
  const subject = truncateText(input.subject.replace(/\s+/g, " ").trim(), 200).text;
  const user = [
    untrusted("subject", subject || "(no subject)"),
    untrusted("from", input.fromAddress),
    untrusted("body", body.text || "(empty)"),
    "Classify this message.",
  ].join("\n");
  return {
    feature: "triage",
    version: TRIAGE_VERSION,
    tier: "fast",
    system: SYSTEM,
    user,
    schemaName: "triage",
    schema: triageSchema,
    maxTokens: 200,
    temperature: 0,
    fake: { kind: "triage", subject, from: input.fromAddress, body: body.text },
  };
}
