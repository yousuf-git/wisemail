import type { z } from "zod";

import type { AiFeature } from "@/lib/ai/types";

/** What each feature hands to the client: the messages plus the shape it must answer in. */
export type PromptBundle<T> = {
  feature: AiFeature;
  /** Bump when the wording changes; stored on `ai_usage`. */
  version: string;
  tier: "fast" | "main";
  system: string;
  user: string;
  schemaName: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  temperature: number;
  /** The already-minimized inputs, for the deterministic fake client. */
  fake: FakePayload;
};

export type FakePayload =
  | { kind: "triage"; subject: string; from: string; body: string }
  | { kind: "draft"; tone: string; lastMessage: string; ourName: string; theirName: string }
  | { kind: "compose"; action: string; tone?: string; subject: string; body: string }
  | { kind: "anomaly"; facts: Record<string, unknown> };
