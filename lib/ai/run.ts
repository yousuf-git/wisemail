import "server-only";

import type { Types } from "mongoose";

import { assertAiAccess } from "@/lib/ai/access";
import { getAiClient, type AiCompletion } from "@/lib/ai/client";
import { commitCredits, releaseCredits, reserveCredits, type UsageRecord } from "@/lib/ai/credits";
import { AiError } from "@/lib/ai/errors";
import type { PromptBundle } from "@/lib/ai/prompts/types";
import { AI_CREDIT_COST } from "@/lib/ai/types";
import { connectDb } from "@/lib/db/connect";

/**
 * One metered AI call: plan gate and opt-out -> reserve credits -> model -> commit (or release
 * on failure). Nothing is charged for a call that did not produce a usable answer.
 */
export async function runAi<T>(input: {
  orgId: Types.ObjectId;
  userId: Types.ObjectId | null;
  bundle: PromptBundle<T>;
  refs?: UsageRecord["refs"];
}): Promise<AiCompletion<T>> {
  const { orgId, userId, bundle, refs } = input;
  await connectDb();
  await assertAiAccess(orgId, bundle.feature);
  const reservation = await reserveCredits(orgId, AI_CREDIT_COST[bundle.feature]);
  let completion: AiCompletion<T>;
  try {
    completion = await getAiClient().complete(bundle);
  } catch (error) {
    await releaseCredits(reservation).catch((e) => console.error("[ai] release failed", e));
    throw error instanceof AiError ? error : new AiError("ai_unavailable");
  }
  try {
    await commitCredits(reservation, {
      userId,
      feature: bundle.feature,
      model: completion.model,
      promptVersion: bundle.version,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      refs,
    });
  } catch (error) {
    // The answer exists; do not leak the hold if settling failed.
    await releaseCredits(reservation).catch(() => undefined);
    throw error;
  }
  return completion;
}
