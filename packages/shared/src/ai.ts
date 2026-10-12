/**
 * AI feature names, credit costs, and client-safe status shapes.
 * Credit costs move to platform settings in Mongo (migration M5); these are seed defaults.
 */

export const AI_FEATURES = ["triage", "draft", "compose", "anomaly"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

/** Flag names under `org_settings.ai.features` (DBD). */
export const AI_FLAGS = ["triage", "drafts", "compose", "anomalies"] as const;
export type AiFlag = (typeof AI_FLAGS)[number];

export const FEATURE_FLAG: Record<AiFeature, AiFlag> = {
  triage: "triage",
  draft: "drafts",
  compose: "compose",
  anomaly: "anomalies",
};

/** Credits per call (PRICING §3 "AI credits") — seed defaults. */
export const DEFAULT_AI_CREDIT_COST: Record<AiFeature, number> = {
  triage: 1,
  compose: 2,
  draft: 5,
  anomaly: 5,
};

/** Alias until DB-backed costs land. */
export const AI_CREDIT_COST = DEFAULT_AI_CREDIT_COST;

export const FEATURE_LABEL: Record<AiFeature, string> = {
  triage: "Inbox triage",
  draft: "Reply drafts",
  compose: "Compose helpers",
  anomaly: "Incident explanations",
};

export const FLAG_INFO: Record<AiFlag, { label: string; description: string; credits: number }> = {
  triage: {
    label: "Inbox triage",
    description: "A one-line summary, category and priority for each new inbound conversation.",
    credits: AI_CREDIT_COST.triage,
  },
  drafts: {
    label: "Reply drafts",
    description: "Draft a reply from the conversation. Never sent without you.",
    credits: AI_CREDIT_COST.draft,
  },
  compose: {
    label: "Compose helpers",
    description: "Subject ideas, rewrite, shorten and grammar fixes in the composer.",
    credits: AI_CREDIT_COST.compose,
  },
  anomalies: {
    label: "Incident explanations",
    description: "A short explanation of an alert, grounded in your delivery data.",
    credits: AI_CREDIT_COST.anomaly,
  },
};

export const TRIAGE_CATEGORIES = [
  "support",
  "sales",
  "billing",
  "spam",
  "auto_reply",
  "other",
] as const;
export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<TriageCategory, string> = {
  support: "Support",
  sales: "Sales",
  billing: "Billing",
  spam: "Spam-ish",
  auto_reply: "Auto-reply",
  other: "Other",
};

export const TRIAGE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TriagePriority = (typeof TRIAGE_PRIORITIES)[number];
export const TRIAGE_SENTIMENTS = ["negative", "neutral", "positive"] as const;
export type TriageSentiment = (typeof TRIAGE_SENTIMENTS)[number];

export const TONES = ["friendly", "professional", "concise", "empathetic"] as const;
export type Tone = (typeof TONES)[number];
export const TONE_LABEL: Record<Tone, string> = {
  friendly: "Friendly",
  professional: "Professional",
  concise: "Concise",
  empathetic: "Empathetic",
};

export const COMPOSE_ACTIONS = ["subjects", "rewrite", "shorten", "grammar"] as const;
export type ComposeAction = (typeof COMPOSE_ACTIONS)[number];

export type TriageDTO = {
  category: TriageCategory;
  priority: TriagePriority;
  sentiment: TriageSentiment;
  summary: string;
};

export type AiLockReason =
  | "not_in_plan"
  | "disabled"
  | "feature_disabled"
  | "no_permission"
  | "credits_exhausted";

export type AiBalanceDTO = {
  allowance: number;
  used: number;
  reserved: number;
  packs: number;
  available: number;
  resetsAt: string;
};

export type AiStatusDTO = {
  planIncluded: boolean;
  enabled: boolean;
  features: Record<AiFlag, boolean>;
  canUse: boolean;
  canConfigure: boolean;
  credits: AiBalanceDTO;
  planLabel: string;
  nextTierLabel: string | null;
};
