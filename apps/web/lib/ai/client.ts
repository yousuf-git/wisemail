import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { AiError } from "@/lib/ai/errors";
import { estimateTokens, fakeInputText, fakeOutput, FAKE_FAIL_MARKER } from "@/lib/ai/fake";
import type { PromptBundle } from "@/lib/ai/prompts/types";
import { env } from "@/lib/env";

/**
 * The single door to a model (TRD §2.9). Chat Completions against any OpenAI-compatible
 * endpoint (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_MODEL_FAST`), JSON-schema structured
 * output when the provider supports it and a Zod-validated JSON parser when it does not.
 * `AI_MODE=fake` swaps in a deterministic local client.
 */

export type AiCompletion<T> = {
  data: T;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

export interface AiClient {
  complete<T>(bundle: PromptBundle<T>): Promise<AiCompletion<T>>;
}

/* ------------------------------------------------------------------------------------------ */
/* Output parsing                                                                              */
/* ------------------------------------------------------------------------------------------ */

/** Pulls a JSON object out of model text (fences, chatter around it) and validates it. */
export function parseModelJson<T>(text: string, schema: z.ZodType<T>): T {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = schema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
    } catch {
      // try the next candidate
    }
  }
  throw new AiError("ai_bad_output");
}

/* ------------------------------------------------------------------------------------------ */
/* Live client                                                                                 */
/* ------------------------------------------------------------------------------------------ */

type Capabilities = {
  /** `response_format: json_schema` accepted by the provider. */
  jsonSchema: boolean;
  /** Token limit parameter name the provider accepts. */
  tokenParam: "max_tokens" | "max_completion_tokens";
  temperature: boolean;
};

const TIMEOUT_MS = { fast: 20_000, main: 45_000 } as const;

export class OpenAiCompatibleClient implements AiClient {
  private readonly capabilities: Capabilities = {
    jsonSchema: true,
    tokenParam: "max_tokens",
    temperature: true,
  };

  constructor(
    private readonly sdk: Pick<OpenAI, "chat">,
    private readonly models: { main: string; fast: string },
  ) {}

  async complete<T>(bundle: PromptBundle<T>): Promise<AiCompletion<T>> {
    const model = bundle.tier === "fast" ? this.models.fast : this.models.main;
    const jsonSchema = z.toJSONSchema(bundle.schema, { target: "draft-7" }) as Record<
      string,
      unknown
    >;
    delete jsonSchema.$schema;
    stripLimits(jsonSchema);

    // Each provider quirk (no json_schema, `max_completion_tokens`, fixed temperature) is
    // learned from a 400 and remembered for the process once a retry succeeds.
    const caps = { ...this.capabilities };
    for (let attempt = 0; attempt < 4; attempt++) {
      const system = caps.jsonSchema
        ? bundle.system
        : `${bundle.system}\nRespond with one JSON object that matches this JSON schema and nothing else:\n${JSON.stringify(jsonSchema)}`;
      try {
        const response = await this.sdk.chat.completions.create(
          {
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: bundle.user },
            ],
            [caps.tokenParam]: bundle.maxTokens,
            ...(caps.temperature ? { temperature: bundle.temperature } : {}),
            ...(caps.jsonSchema
              ? {
                  response_format: {
                    type: "json_schema",
                    json_schema: { name: bundle.schemaName, strict: true, schema: jsonSchema },
                  },
                }
              : {}),
          } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
          { timeout: TIMEOUT_MS[bundle.tier] },
        );
        const text = response.choices[0]?.message?.content ?? "";
        const data = parseModelJson(text, bundle.schema);
        Object.assign(this.capabilities, caps); // only what worked is remembered
        return {
          data,
          model: response.model || model,
          promptTokens: response.usage?.prompt_tokens ?? estimateTokens(system + bundle.user),
          completionTokens: response.usage?.completion_tokens ?? estimateTokens(text),
        };
      } catch (error) {
        if (error instanceof AiError) throw error;
        if (error instanceof OpenAI.APIError && (error.status === 400 || error.status === 422)) {
          const message = `${error.message} ${JSON.stringify(error.error ?? "")}`.toLowerCase();
          if (message.includes("max_completion_tokens") && caps.tokenParam === "max_tokens") {
            caps.tokenParam = "max_completion_tokens";
            continue;
          }
          if (message.includes("temperature") && caps.temperature) {
            caps.temperature = false;
            continue;
          }
          if (caps.jsonSchema) {
            caps.jsonSchema = false;
            continue;
          }
        }
        logProviderError(error);
        throw new AiError("ai_unavailable");
      }
    }
    throw new AiError("ai_unavailable");
  }
}

/** Strict mode rejects size keywords on some providers; Zod still enforces them on the way back. */
function stripLimits(node: unknown): void {
  if (Array.isArray(node)) return node.forEach(stripLimits);
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  for (const key of ["minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum"]) {
    delete record[key];
  }
  Object.values(record).forEach(stripLimits);
}

function logProviderError(error: unknown) {
  // Never log prompts or completions: they are customer mail.
  const detail =
    error instanceof OpenAI.APIError
      ? `status ${error.status ?? "none"}: ${error.message.slice(0, 200)}`
      : error instanceof Error
        ? error.message.slice(0, 200)
        : "unknown";
  console.error(`[ai] provider call failed (${detail})`);
}

/* ------------------------------------------------------------------------------------------ */
/* Fake client                                                                                 */
/* ------------------------------------------------------------------------------------------ */

export class FakeAiClient implements AiClient {
  readonly calls: PromptBundle<unknown>[] = [];

  async complete<T>(bundle: PromptBundle<T>): Promise<AiCompletion<T>> {
    this.calls.push(bundle);
    const text = fakeInputText(bundle);
    if (text.includes(FAKE_FAIL_MARKER)) throw new AiError("ai_unavailable");
    const parsed = bundle.schema.safeParse(fakeOutput(bundle.fake));
    if (!parsed.success) throw new AiError("ai_bad_output");
    return {
      data: parsed.data,
      model: bundle.tier === "fast" ? "fake-fast" : "fake-main",
      promptTokens: estimateTokens(text),
      completionTokens: estimateTokens(JSON.stringify(parsed.data)),
    };
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Selection                                                                                   */
/* ------------------------------------------------------------------------------------------ */

let override: AiClient | null = null;
let cached: AiClient | null = null;

/** Tests inject their own client (or `null` to go back to the configured one). */
export function setAiClient(client: AiClient | null) {
  override = client;
}

export function getAiClient(): AiClient {
  if (override) return override;
  if (cached) return cached;
  if (env.AI_MODE === "fake") {
    cached = new FakeAiClient();
    return cached;
  }
  const model = env.AI_MODEL!;
  cached = new OpenAiCompatibleClient(
    new OpenAI({
      apiKey: env.AI_API_KEY!,
      baseURL: env.AI_BASE_URL,
      timeout: TIMEOUT_MS.main,
      maxRetries: 2,
    }),
    { main: model, fast: env.AI_MODEL_FAST ?? model },
  );
  return cached;
}
