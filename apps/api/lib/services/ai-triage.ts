import "server-only";

import { Types } from "mongoose";

import { aiAllowed } from "@/lib/ai/access";
import { AiError } from "@/lib/ai/errors";
import { buildTriagePrompt } from "@/lib/ai/prompts/triage";
import { runAi } from "@/lib/ai/run";
import type { TriageDTO } from "@/lib/ai/types";
import { connectDb } from "@/lib/db/connect";
import { EmailContentModel } from "@/lib/db/models/email-contents";
import { EmailModel } from "@/lib/db/models/emails";
import { ThreadModel } from "@/lib/db/models/threads";
import { env } from "@/lib/env";
import { enqueueAiTriage } from "@/lib/jobs/send";
import { publish } from "@/lib/realtime/publish";

/**
 * Inbox triage (PRD §5.10): category, priority, sentiment and a one-line summary for each new
 * inbound message, computed by the `ai-triage` job with the fast model. The newest message's
 * result also lives on the thread (`aiTriage`, `aiCategory`) for the row chip and the filter.
 */

/** Called after an inbound message is stored: enqueue only when AI could actually run. */
export async function requestTriage(input: {
  orgId: Types.ObjectId;
  emailId: Types.ObjectId;
}): Promise<boolean> {
  try {
    if (!(await aiAllowed(input.orgId, "triage"))) return false;
    const request = { orgId: input.orgId.toHexString(), emailId: input.emailId.toHexString() };
    const delivered = await enqueueAiTriage(request);
    if (!delivered && env.INNGEST_DEV && env.NODE_ENV !== "production") {
      // No Inngest dev server running: run the job in this process (same fallback as fetch-inbound).
      void triageEmail(request).catch((error) => console.error("[ai] inline triage failed", error));
    }
    return true;
  } catch (error) {
    // Triage is a nicety; it must never make an inbound fetch fail or retry.
    console.warn("[ai] could not enqueue triage", error instanceof Error ? error.message : error);
    return false;
  }
}

export type TriageOutcome =
  | { status: "done"; threadId: string; triage: TriageDTO }
  | {
      status: "skipped";
      reason:
        | "not_found"
        | "not_inbound"
        | "no_content"
        | "already_done"
        | "ai_not_in_plan"
        | "ai_disabled"
        | "ai_feature_disabled"
        | "ai_credits_exhausted";
    };

export const toTriageDTO = (
  t?: {
    category?: string | null;
    priority?: string | null;
    sentiment?: string | null;
    summary?: string | null;
  } | null,
): TriageDTO | null =>
  t?.category
    ? ({
        category: t.category,
        priority: t.priority ?? "normal",
        sentiment: t.sentiment ?? "neutral",
        summary: t.summary ?? "",
      } as TriageDTO)
    : null;

/** Idempotent: a message that already has a summary is not charged again on a retry. */
export async function triageEmail(input: {
  orgId: string;
  emailId: string;
}): Promise<TriageOutcome> {
  await connectDb();
  if (!Types.ObjectId.isValid(input.orgId) || !Types.ObjectId.isValid(input.emailId)) {
    return { status: "skipped", reason: "not_found" };
  }
  const orgId = new Types.ObjectId(input.orgId);
  const email = await EmailModel.findOne({ _id: input.emailId, orgId }).lean();
  if (!email || email.trashedAt) return { status: "skipped", reason: "not_found" };
  if (email.direction !== "inbound") return { status: "skipped", reason: "not_inbound" };

  const content = await EmailContentModel.findOne(
    { orgId, emailId: email._id },
    { html: 1, text: 1, aiSummary: 1 },
  ).lean();
  if (!content || (!content.text?.trim() && !content.html?.trim())) {
    return { status: "skipped", reason: "no_content" };
  }
  if (content.aiSummary?.generatedAt) return { status: "skipped", reason: "already_done" };

  const bundle = buildTriagePrompt({
    subject: email.subject,
    fromAddress: email.from.address,
    text: content.text,
    html: content.html,
  });
  let completion;
  try {
    completion = await runAi({
      orgId,
      userId: null,
      bundle,
      refs: { emailId: email._id, threadId: email.threadId ?? undefined },
    });
  } catch (error) {
    if (
      error instanceof AiError &&
      ["ai_not_in_plan", "ai_disabled", "ai_feature_disabled", "ai_credits_exhausted"].includes(
        error.aiCode,
      )
    ) {
      return { status: "skipped", reason: error.aiCode as never };
    }
    throw error; // provider trouble: the job retries
  }

  const { data, model } = completion;
  const generatedAt = new Date();
  await EmailContentModel.updateOne(
    { orgId, emailId: email._id },
    { $set: { aiSummary: { ...data, model, generatedAt } } },
  );
  const at = email.receivedAt ?? email.createdAt;
  const threadId = email.threadId ?? null;
  if (threadId) {
    // Only the newest inbound message speaks for the conversation.
    const updated = await ThreadModel.updateOne(
      {
        _id: threadId,
        orgId,
        $or: [{ lastInboundAt: { $lte: at } }, { lastInboundAt: { $exists: false } }],
      },
      {
        $set: {
          aiCategory: data.category,
          aiTriage: { emailId: email._id, ...data, model, generatedAt },
        },
      },
    );
    if (updated.matchedCount > 0) {
      await publish({
        orgId,
        projectId: email.projectId ?? null,
        topics: ["threads", `thread:${threadId.toHexString()}`],
        patch: { threadId: threadId.toHexString(), aiCategory: data.category },
      });
    }
  }
  return {
    status: "done",
    threadId: threadId?.toHexString() ?? "",
    triage: data,
  };
}
