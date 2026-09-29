import "server-only";

import { Types } from "mongoose";

import { AiError } from "@/lib/ai/errors";
import { paragraphsToHtml, paragraphsToText } from "@/lib/ai/format";
import { buildRewritePrompt, buildSubjectsPrompt } from "@/lib/ai/prompts/compose";
import { htmlToPlain } from "@/lib/ai/prompts/text";
import { runAi } from "@/lib/ai/run";
import type { ComposeAction, Tone } from "@/lib/ai/types";
import { authorize, type OrgContext } from "@/lib/dal";

export type ComposeAssistResult =
  | { kind: "subjects"; suggestions: string[]; model: string }
  | { kind: "text"; html: string; text: string; model: string };

/**
 * Composer helpers (PRD §5.10): subject ideas, rewrite in a tone, shorten, fix grammar. The
 * member's own draft is the only input; the result is a suggestion they accept or discard.
 */
export async function composeAssist(
  ctx: OrgContext,
  input: { action: ComposeAction; subject?: string; bodyHtml: string; tone?: Tone },
): Promise<ComposeAssistResult> {
  authorize(ctx, "ai:use");
  const hasBody = htmlToPlain(input.bodyHtml).trim().length > 0;
  if (input.action === "subjects" ? !hasBody && !input.subject?.trim() : !hasBody) {
    throw new AiError("ai_no_content");
  }
  const orgId = new Types.ObjectId(ctx.org.id);
  const userId = new Types.ObjectId(ctx.user.id);
  if (input.action === "subjects") {
    const { data, model } = await runAi({
      orgId,
      userId,
      bundle: buildSubjectsPrompt({ subject: input.subject ?? "", bodyHtml: input.bodyHtml }),
    });
    return { kind: "subjects", suggestions: data.suggestions, model };
  }
  const { data, model } = await runAi({
    orgId,
    userId,
    bundle: buildRewritePrompt({
      action: input.action,
      bodyHtml: input.bodyHtml,
      tone: input.tone,
    }),
  });
  return {
    kind: "text",
    html: paragraphsToHtml(data.paragraphs),
    text: paragraphsToText(data.paragraphs),
    model,
  };
}
