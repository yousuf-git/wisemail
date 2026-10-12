import "server-only";

import { Types } from "mongoose";

import { AiError } from "@/lib/ai/errors";
import { paragraphsToHtml, paragraphsToText } from "@/lib/ai/format";
import { buildDraftPrompt, type DraftThreadMessage } from "@/lib/ai/prompts/draft";
import { runAi } from "@/lib/ai/run";
import type { Tone } from "@/lib/ai/types";
import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { EmailContentModel } from "@/lib/db/models/email-contents";
import { EmailModel } from "@/lib/db/models/emails";
import { ThreadModel } from "@/lib/db/models/threads";
import { ServiceError } from "./errors";
import { projectFilter } from "./project-scope";

export type DraftReplyResult = { html: string; text: string; model: string };

const label = (a: { address: string; name?: string | null }) => a.name?.trim() || a.address;

/**
 * Reply draft from thread context (PRD §5.10). Reads only this thread (project scope applies),
 * sends the newest messages minus quoted history and signatures, returns a suggestion the
 * member edits and sends themselves: nothing is sent and nothing is saved here.
 */
export async function draftReply(
  ctx: OrgContext,
  input: { threadId: string; tone: Tone; instructions?: string },
): Promise<DraftReplyResult> {
  authorize(ctx, "ai:use");
  authorize(ctx, "thread:read");
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  if (!Types.ObjectId.isValid(input.threadId))
    throw new ServiceError("not_found", "Thread not found.");
  const thread = await ThreadModel.findOne(
    { _id: input.threadId, orgId, ...projectFilter(ctx) },
    { subject: 1 },
  ).lean();
  if (!thread) throw new ServiceError("not_found", "Thread not found.");

  const emails = await EmailModel.find(
    {
      orgId,
      threadId: thread._id,
      trashedAt: null,
      status: { $nin: ["canceled", "draft", "scheduled"] },
    },
    { direction: 1, from: 1, receivedAt: 1, sentAt: 1, createdAt: 1 },
  ).lean();
  const at = (e: (typeof emails)[number]) => e.receivedAt ?? e.sentAt ?? e.createdAt;
  emails.sort((a, b) => at(a).getTime() - at(b).getTime());
  const recent = emails.slice(-6);
  const contents = await EmailContentModel.find(
    { orgId, emailId: { $in: recent.map((e) => e._id) } },
    { emailId: 1, text: 1, html: 1, sourceText: 1, sourceHtml: 1 },
  ).lean();
  const byEmail = new Map(contents.map((c) => [c.emailId.toHexString(), c]));

  const messages: DraftThreadMessage[] = recent
    .map((e) => {
      const c = byEmail.get(e._id.toHexString());
      return {
        direction: e.direction,
        who: label(e.from),
        text: c?.text ?? c?.sourceText ?? null,
        html: c?.html ?? c?.sourceHtml ?? null,
      };
    })
    .filter((m) => m.text?.trim() || m.html?.trim());
  if (!messages.some((m) => m.direction === "inbound")) throw new AiError("ai_no_content");

  const bundle = buildDraftPrompt({
    subject: thread.subject,
    messages,
    tone: input.tone,
    ourName: ctx.user.name,
    instructions: input.instructions,
  });
  const { data, model } = await runAi({
    orgId,
    userId: new Types.ObjectId(ctx.user.id),
    bundle,
    refs: { threadId: thread._id },
  });
  return {
    html: paragraphsToHtml(data.paragraphs),
    text: paragraphsToText(data.paragraphs),
    model,
  };
}
