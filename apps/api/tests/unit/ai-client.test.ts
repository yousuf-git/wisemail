import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FakeAiClient, OpenAiCompatibleClient, parseModelJson } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import { buildComposePromptForTest } from "./ai-helpers";
import { buildTriagePrompt } from "@/lib/ai/prompts/triage";

const schema = z.object({ a: z.string(), n: z.number() });

describe("parseModelJson", () => {
  it("accepts plain JSON, fenced JSON and JSON with chatter around it", () => {
    expect(parseModelJson('{"a":"x","n":1}', schema)).toEqual({ a: "x", n: 1 });
    expect(parseModelJson('```json\n{"a":"x","n":1}\n```', schema)).toEqual({ a: "x", n: 1 });
    expect(parseModelJson('Sure! Here you go: {"a":"x","n":2} Hope it helps', schema)).toEqual({
      a: "x",
      n: 2,
    });
  });

  it("rejects text that is not the schema", () => {
    expect(() => parseModelJson("no json here", schema)).toThrow(AiError);
    expect(() => parseModelJson('{"a":1}', schema)).toThrow(/structured|shape|couldn't use/i);
  });
});

function reply(content: string, extra: Record<string, unknown> = {}) {
  return {
    model: "test-model",
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 11, completion_tokens: 7 },
    ...extra,
  };
}

const apiError = (status: number, message: string) =>
  new OpenAI.APIError(status, { message }, message, new Headers());

const triageBundle = () =>
  buildTriagePrompt({ subject: "Help", fromAddress: "a@b.co", text: "My app is broken" });
const ANSWER = JSON.stringify({
  category: "support",
  priority: "normal",
  sentiment: "negative",
  summary: "App is broken.",
});

describe("OpenAiCompatibleClient", () => {
  it("asks for a JSON schema, reads usage and picks the model by tier", async () => {
    const create = vi.fn().mockResolvedValue(reply(ANSWER));
    const client = new OpenAiCompatibleClient({ chat: { completions: { create } } } as never, {
      main: "big",
      fast: "small",
    });
    const result = await client.complete(triageBundle());
    expect(result).toMatchObject({
      data: { category: "support" },
      model: "test-model",
      promptTokens: 11,
      completionTokens: 7,
    });
    const [params] = create.mock.calls[0]!;
    expect(params.model).toBe("small");
    expect(params.response_format.type).toBe("json_schema");
    expect(params.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(JSON.stringify(params.response_format)).not.toMatch(/maxLength|minLength/);
    expect(params.max_tokens).toBe(200);
  });

  it("falls back to a schema-in-prompt parse when json_schema is refused, and remembers it", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(apiError(400, "response_format json_schema is not supported"))
      .mockResolvedValue(reply(`\`\`\`json\n${ANSWER}\n\`\`\``));
    const client = new OpenAiCompatibleClient({ chat: { completions: { create } } } as never, {
      main: "big",
      fast: "big",
    });
    await expect(client.complete(triageBundle())).resolves.toMatchObject({
      data: { priority: "normal" },
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]![0].response_format).toBeUndefined();
    expect(create.mock.calls[1]![0].messages[0].content).toContain("JSON schema");
    await client.complete(triageBundle());
    expect(create.mock.calls[2]![0].response_format).toBeUndefined(); // learned
  });

  it("adapts to max_completion_tokens and fixed temperature", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        apiError(400, "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens'"),
      )
      .mockRejectedValueOnce(apiError(400, "Unsupported value: 'temperature' does not support 0"))
      .mockResolvedValue(reply(ANSWER));
    const client = new OpenAiCompatibleClient({ chat: { completions: { create } } } as never, {
      main: "m",
      fast: "m",
    });
    await client.complete(triageBundle());
    const last = create.mock.calls.at(-1)![0];
    expect(last.max_completion_tokens).toBe(200);
    expect(last.max_tokens).toBeUndefined();
    expect(last.temperature).toBeUndefined();
    expect(last.response_format.type).toBe("json_schema"); // structured output was kept
  });

  it("maps provider failures to ai_unavailable and unusable text to ai_bad_output", async () => {
    const down = new OpenAiCompatibleClient(
      {
        chat: { completions: { create: vi.fn().mockRejectedValue(apiError(503, "overloaded")) } },
      } as never,
      { main: "m", fast: "m" },
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(down.complete(triageBundle())).rejects.toMatchObject({ aiCode: "ai_unavailable" });

    const garbage = new OpenAiCompatibleClient(
      {
        chat: { completions: { create: vi.fn().mockResolvedValue(reply("I cannot do that")) } },
      } as never,
      { main: "m", fast: "m" },
    );
    await expect(garbage.complete(triageBundle())).rejects.toMatchObject({
      aiCode: "ai_bad_output",
    });
  });
});

describe("FakeAiClient", () => {
  it("is deterministic and schema-valid for every feature", async () => {
    const fake = new FakeAiClient();
    const triage = triageBundle();
    const a = await fake.complete(triage);
    const b = await fake.complete(triage);
    expect(a.data).toEqual(b.data);
    expect(a).toMatchObject({
      model: "fake-fast",
      data: { category: "support", sentiment: "negative" },
    });

    for (const bundle of buildComposePromptForTest()) {
      const out = await fake.complete(bundle as never);
      expect(out.data).toBeTruthy();
    }
  });

  it("fails on the marker so tests can exercise release-on-error", async () => {
    const fake = new FakeAiClient();
    await expect(
      fake.complete(
        buildTriagePrompt({ subject: "x", fromAddress: "a@b.co", text: "[[ai-fail]] boom" }),
      ),
    ).rejects.toMatchObject({ aiCode: "ai_unavailable" });
  });
});
