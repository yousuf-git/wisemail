import { z } from "zod";

import type { ComposeAction, Tone } from "@/lib/ai/types";
import { paragraphsSchema, type ParagraphsResult } from "./draft";
import { prepareComposeText, truncateText, untrusted, UNTRUSTED_NOTICE } from "./text";
import type { PromptBundle } from "./types";

export const COMPOSE_VERSION = "compose@1";
export const COMPOSE_BODY_LIMIT = 4_000;

export const subjectsSchema = z.object({
  suggestions: z.array(z.string().min(1).max(120)).min(3).max(5),
});
export type SubjectsResult = z.infer<typeof subjectsSchema>;

const SYSTEM = `You help write outgoing email. Follow the task exactly and keep the author's meaning, facts, names, numbers and links unchanged. Never add claims. Keep the language of the original text. Reply with JSON only.
${UNTRUSTED_NOTICE}`;

const TASK: Record<ComposeAction, (tone?: Tone) => string> = {
  subjects: () =>
    "Suggest 4 subject lines for this email: specific, under 60 characters, no clickbait, no emoji, no quotes around them.",
  rewrite: (tone) =>
    `Rewrite the message body in a ${tone ?? "friendly"} tone. Same content, clearer wording. Return the body as short plain-text paragraphs, without a subject or signature.`,
  shorten: () =>
    "Shorten the message body to roughly half its length without losing any request, date or number. Return short plain-text paragraphs, without a subject or signature.",
  grammar: () =>
    "Fix spelling, grammar and punctuation only. Keep wording and tone as they are. Return the body as plain-text paragraphs, without a subject or signature.",
};

function common(action: ComposeAction, input: { subject?: string; bodyHtml: string; tone?: Tone }) {
  const body = prepareComposeText(input.bodyHtml, COMPOSE_BODY_LIMIT);
  const subject = truncateText((input.subject ?? "").trim(), 200).text;
  const user = [
    subject ? untrusted("current_subject", subject) : "",
    untrusted("body", body.text || "(empty)"),
    TASK[action](input.tone),
  ]
    .filter(Boolean)
    .join("\n");
  return {
    feature: "compose" as const,
    version: COMPOSE_VERSION,
    tier: "fast" as const,
    system: SYSTEM,
    user,
    temperature: action === "grammar" ? 0 : 0.5,
    fake: { kind: "compose" as const, action, tone: input.tone, subject, body: body.text },
  };
}

export function buildSubjectsPrompt(input: {
  subject: string;
  bodyHtml: string;
}): PromptBundle<SubjectsResult> {
  return {
    ...common("subjects", input),
    schemaName: "subject_ideas",
    schema: subjectsSchema,
    maxTokens: 200,
  };
}

export function buildRewritePrompt(input: {
  action: Exclude<ComposeAction, "subjects">;
  bodyHtml: string;
  tone?: Tone;
}): PromptBundle<ParagraphsResult> {
  return {
    ...common(input.action, input),
    schemaName: "rewrite",
    schema: paragraphsSchema,
    maxTokens: 900,
  };
}
