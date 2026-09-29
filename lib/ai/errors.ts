import { ServiceError } from "@/lib/services/errors";

export type AiErrorCode =
  | "ai_not_in_plan"
  | "ai_disabled"
  | "ai_feature_disabled"
  | "ai_credits_exhausted"
  | "ai_unavailable"
  | "ai_bad_output"
  | "ai_no_content";

const MESSAGES: Record<AiErrorCode, string> = {
  ai_not_in_plan:
    "AI assist is part of the paid plans. Upgrade to Pro to summarize, draft and polish with Wizi.",
  ai_disabled:
    "AI assist is turned off for this workspace. An Owner or Admin can turn it on in Settings, AI.",
  ai_feature_disabled:
    "This AI feature is turned off for this workspace. An Owner or Admin can turn it on in Settings, AI.",
  ai_credits_exhausted:
    "Your workspace has used all its AI credits for this period. They reset with the next billing period, and an Owner can add a credit pack.",
  ai_unavailable: "The AI service didn't answer, so nothing was used. Try again in a moment.",
  ai_bad_output: "The AI answered in a shape we couldn't use, so nothing was used. Try again.",
  ai_no_content: "There isn't enough text to work with yet.",
};

/** Typed, user-facing AI failure; `orgAction` and `orgRoute` already know how to surface it. */
export class AiError extends ServiceError {
  constructor(
    readonly aiCode: AiErrorCode,
    message?: string,
  ) {
    super(aiCode, message ?? MESSAGES[aiCode]);
    this.name = "AiError";
  }
}

export const isAiError = (error: unknown): error is AiError => error instanceof AiError;
