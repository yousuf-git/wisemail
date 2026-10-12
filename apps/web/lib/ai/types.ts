/**
 * Client-safe AI vocabulary. Core constants and status DTOs live in `@wisemail/shared`;
 * this module re-exports them and keeps web-local aliases stable.
 */

export {
  AI_CREDIT_COST,
  AI_FEATURES,
  AI_FLAGS,
  CATEGORY_LABEL,
  COMPOSE_ACTIONS,
  DEFAULT_AI_CREDIT_COST,
  FEATURE_FLAG,
  FEATURE_LABEL,
  FLAG_INFO,
  TONES,
  TONE_LABEL,
  TRIAGE_CATEGORIES,
  TRIAGE_PRIORITIES,
  TRIAGE_SENTIMENTS,
  type AiBalanceDTO,
  type AiFeature,
  type AiFlag,
  type AiLockReason,
  type AiStatusDTO,
  type ComposeAction,
  type Tone,
  type TriageCategory,
  type TriageDTO,
  type TriagePriority,
  type TriageSentiment,
} from "@wisemail/shared/ai";
