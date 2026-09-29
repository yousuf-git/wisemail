import { z } from "zod";

import type { Tone } from "@/lib/ai/types";
import { prepareBody, truncateText, untrusted, UNTRUSTED_NOTICE } from "./text";
import type { PromptBundle } from "./types";

export const DRAFT_VERSION = "draft@1";
/** Newest messages first; older ones are dropped, never summarized. */
export const DRAFT_MESSAGES = 4;
export const DRAFT_MESSAGE_LIMIT = 1_500;
export const DRAFT_TOTAL_LIMIT = 4_500;

export const paragraphsSchema = z.object({
  paragraphs: z.array(z.string().min(1).max(2_000)).min(1).max(12),
});
export type ParagraphsResult = z.infer<typeof paragraphsSchema>;

const TONE_HINT: Record<Tone, string> = {
  friendly: "warm and friendly, plain words",
  professional: "professional and courteous",
  concise: "brief and direct, at most three short paragraphs",
  empathetic: "empathetic and reassuring, acknowledge the person's situation first",
};

const SYSTEM = `You draft a reply to an email conversation on behalf of a support or sales teammate.
Write only the body of the reply as short plain-text paragraphs: no subject, no greeting line beyond a short opener, no signature, no placeholders like [name].
Answer what the last message asks. Do not invent facts, prices, dates or promises you were not given; if something is unknown, say you will check and follow up.
Write in the language of the last message. Reply with JSON only.
${UNTRUSTED_NOTICE}`;

export type DraftThreadMessage = {
  direction: "inbound" | "outbound";
  /** Display name or address of the author. */
  who: string;
  text?: string | null;
  html?: string | null;
};

/** Messages must be oldest first. Quoted history and signatures are stripped from each. */
export function buildDraftPrompt(input: {
  subject: string;
  messages: DraftThreadMessage[];
  tone: Tone;
  ourName: string;
  instructions?: string;
}): PromptBundle<ParagraphsResult> {
  const recent = input.messages.slice(-DRAFT_MESSAGES);
  let budget = DRAFT_TOTAL_LIMIT;
  const parts: string[] = [];
  // Newest first so the budget favors the latest messages, then restored to reading order.
  for (const message of [...recent].reverse()) {
    if (budget <= 0) break;
    const body = prepareBody(message, Math.min(DRAFT_MESSAGE_LIMIT, budget));
    budget -= body.text.length;
    parts.unshift(
      untrusted(
        message.direction === "inbound" ? "message_from_them" : "message_from_us",
        `${message.who}:\n${body.text || "(empty)"}`,
      ),
    );
  }
  const last = [...recent].reverse().find((m) => m.direction === "inbound") ?? recent.at(-1);
  const lastBody = last ? prepareBody(last, DRAFT_MESSAGE_LIMIT).text : "";
  const extra = input.instructions?.trim()
    ? `\nExtra guidance from the teammate: ${untrusted("guidance", truncateText(input.instructions.trim(), 300).text)}`
    : "";
  const user = [
    untrusted("subject", truncateText(input.subject, 200).text || "(no subject)"),
    ...parts,
    `Tone: ${TONE_HINT[input.tone]}. The reply is from ${input.ourName || "the team"}.${extra}`,
    "Draft the reply.",
  ].join("\n");
  return {
    feature: "draft",
    version: DRAFT_VERSION,
    tier: "main",
    system: SYSTEM,
    user,
    schemaName: "reply_draft",
    schema: paragraphsSchema,
    maxTokens: 700,
    temperature: 0.4,
    fake: {
      kind: "draft",
      tone: input.tone,
      lastMessage: lastBody,
      ourName: input.ourName,
      theirName: last?.who ?? "",
    },
  };
}
