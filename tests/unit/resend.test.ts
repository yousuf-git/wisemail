import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mapResendError, ResendError } from "@/lib/resend/errors";
import { SUPPORTED_EVENT_TYPES, signWebhook, verifyWebhook } from "@/lib/resend/events";
import {
  FakeResendAdapter,
  FAKE_WEBHOOK_LIMIT,
  fakeStore,
  parseFakeKey,
  resetFakeResend,
} from "@/lib/resend/fake-adapter";

describe("mapResendError", () => {
  const cases: [string, { name?: string; statusCode?: number | null }, string][] = [
    ["429 status", { statusCode: 429, name: "rate_limit_exceeded" }, "resend_rate_limited"],
    ["quota 429", { statusCode: 429, name: "daily_quota_exceeded" }, "resend_rate_limited"],
    ["restricted key (401)", { statusCode: 401, name: "restricted_api_key" }, "resend_forbidden"],
    ["invalid access", { statusCode: 403, name: "invalid_access" }, "resend_forbidden"],
    ["403 fallback", { statusCode: 403, name: "security_error" }, "resend_forbidden"],
    ["invalid key (400)", { statusCode: 400, name: "invalid_api_key" }, "resend_unauthorized"],
    ["invalid key (403)", { statusCode: 403, name: "invalid_api_key" }, "resend_unauthorized"],
    ["missing key", { statusCode: 401, name: "missing_api_key" }, "resend_unauthorized"],
    ["401 fallback", { statusCode: 401 }, "resend_unauthorized"],
    ["not found", { statusCode: 404, name: "not_found" }, "resend_not_found"],
    ["validation", { statusCode: 422, name: "validation_error" }, "resend_validation"],
    ["bad param", { statusCode: 400, name: "invalid_parameter" }, "resend_validation"],
    ["400 fallback", { statusCode: 400 }, "resend_validation"],
    ["server error", { statusCode: 500, name: "internal_server_error" }, "resend_unknown"],
    ["nothing", {}, "resend_unknown"],
  ];
  it.each(cases)("%s", (_label, error, code) => {
    const mapped = mapResendError({ message: "boom", ...error });
    expect(mapped).toBeInstanceOf(ResendError);
    expect(mapped.code).toBe(code);
    expect(mapped.message).toBe("boom");
  });

  it("reads retry-after from the response headers", () => {
    const mapped = mapResendError(
      { name: "rate_limit_exceeded", statusCode: 429 },
      { "retry-after": "7" },
    );
    expect(mapped.details.retryAfterSeconds).toBe(7);
  });
});

describe("LiveResendAdapter (SDK mocked)", () => {
  afterEach(() => vi.resetModules());

  async function withSdk(sdk: Record<string, unknown>) {
    vi.resetModules();
    vi.doMock("resend", () => ({
      Resend: class {
        constructor() {
          Object.assign(this, sdk);
        }
      },
    }));
    const { LiveResendAdapter } = await import("@/lib/resend/adapter");
    return new LiveResendAdapter("re_x");
  }

  it("normalizes lists and maps SDK errors", async () => {
    const adapter = await withSdk({
      domains: {
        list: async () => ({
          data: {
            object: "list",
            has_more: true,
            data: [
              { id: "d1", name: "a.com", status: "verified", region: "us-east-1", created_at: "t" },
            ],
          },
          error: null,
          headers: {},
        }),
      },
      apiKeys: {
        list: async () => ({
          data: null,
          error: { name: "restricted_api_key", message: "no", statusCode: 401 },
          headers: null,
        }),
      },
      webhooks: {
        create: async () => ({
          data: { id: "wh", signing_secret: "whsec_abc", object: "webhook" },
          error: null,
          headers: {},
        }),
        remove: async () => ({
          data: null,
          error: { name: "not_found", message: "gone", statusCode: 404 },
          headers: {},
        }),
      },
    });
    expect(await adapter.listDomains()).toEqual({
      data: [expect.objectContaining({ id: "d1", createdAt: "t" })],
      hasMore: true,
      nextCursor: "d1",
    });
    await expect(adapter.listApiKeys()).rejects.toMatchObject({ code: "resend_forbidden" });
    expect(await adapter.createWebhook({ endpoint: "https://x", events: ["email.sent"] })).toEqual({
      id: "wh",
      signingSecret: "whsec_abc",
    });
    await expect(adapter.deleteWebhook("wh")).rejects.toMatchObject({ code: "resend_not_found" });
  });

  it("maps thrown network errors to resend_unknown", async () => {
    const adapter = await withSdk({
      domains: {
        list: async () => {
          throw new Error("ECONNRESET");
        },
      },
    });
    await expect(adapter.listDomains()).rejects.toMatchObject({
      code: "resend_unknown",
      message: "ECONNRESET",
    });
  });
});

describe("FakeResendAdapter", () => {
  beforeEach(() => resetFakeResend());

  it("parses keys into team and flags", () => {
    expect(parseFakeKey("re_Acme_sending_x")).toEqual({
      team: "acme",
      flags: new Set(["sending", "x"]),
    });
  });

  it("healthy key: lists domains and keys, registers and deletes webhooks", async () => {
    const adapter = new FakeResendAdapter("re_acme_full");
    expect((await adapter.listDomains()).data.length).toBeGreaterThan(0);
    expect((await adapter.listApiKeys()).data.length).toBeGreaterThan(0);
    const wh = await adapter.createWebhook({ endpoint: "https://x/y", events: ["email.sent"] });
    expect(wh.signingSecret).toMatch(/^whsec_/);
    await adapter.deleteWebhook(wh.id);
    await expect(adapter.deleteWebhook(wh.id)).rejects.toMatchObject({ code: "resend_not_found" });
  });

  it("sending-only, invalid and rate-limited keys map to the right codes", async () => {
    await expect(new FakeResendAdapter("re_a_sending").listDomains()).rejects.toMatchObject({
      code: "resend_forbidden",
    });
    await expect(new FakeResendAdapter("re_a_invalid").listDomains()).rejects.toMatchObject({
      code: "resend_unauthorized",
    });
    await expect(new FakeResendAdapter("re_a_ratelimit").listDomains()).rejects.toMatchObject({
      code: "resend_rate_limited",
      details: { retryAfterSeconds: 1 },
    });
  });

  it("no free webhook slot is a validation error, by flag and by count", async () => {
    await expect(
      new FakeResendAdapter("re_b_slotfull").createWebhook({ endpoint: "x", events: [] }),
    ).rejects.toMatchObject({ code: "resend_validation" });
    const adapter = new FakeResendAdapter("re_c");
    for (let i = 0; i < FAKE_WEBHOOK_LIMIT; i++) {
      await adapter.createWebhook({ endpoint: "x", events: [] });
    }
    await expect(adapter.createWebhook({ endpoint: "x", events: [] })).rejects.toMatchObject({
      code: "resend_validation",
    });
    expect(fakeStore().teams.get("c")!.webhooks.size).toBe(FAKE_WEBHOOK_LIMIT);
  });

  it("gives every webhook a distinct, valid Svix secret", async () => {
    const adapter = new FakeResendAdapter("re_d");
    const a = await adapter.createWebhook({ endpoint: "x", events: [] });
    const b = await adapter.createWebhook({ endpoint: "x", events: [] });
    expect(a.signingSecret).not.toBe(b.signingSecret);
    const body = JSON.stringify({
      type: "email.sent",
      created_at: new Date().toISOString(),
      data: {},
    });
    const headers = new Headers(signWebhook(a.signingSecret, body));
    expect(verifyWebhook(body, headers, a.signingSecret).ok).toBe(true);
    expect(verifyWebhook(body, headers, b.signingSecret)).toMatchObject({ ok: false });
  });
});

describe("verifyWebhook", () => {
  const secret = `whsec_${Buffer.alloc(32, 3).toString("base64")}`;
  const body = JSON.stringify({
    type: "email.delivered",
    created_at: "2026-09-29T10:00:00.000Z",
    data: { email_id: "e1" },
  });

  it("accepts a signed payload and returns the svix id and event", () => {
    const headers = new Headers(signWebhook(secret, body, { id: "msg_1" }));
    const result = verifyWebhook(body, headers, secret);
    expect(result).toMatchObject({ ok: true, svixId: "msg_1", event: { type: "email.delivered" } });
  });

  it("rejects missing headers, a tampered body, a wrong secret and stale timestamps", () => {
    const headers = new Headers(signWebhook(secret, body));
    expect(verifyWebhook(body, new Headers(), secret)).toMatchObject({ reason: "missing_headers" });
    expect(verifyWebhook(body + " ", headers, secret)).toMatchObject({ reason: "bad_signature" });
    expect(
      verifyWebhook(body, headers, `whsec_${Buffer.alloc(32, 9).toString("base64")}`),
    ).toMatchObject({ reason: "bad_signature" });
    const stale = new Headers(
      signWebhook(secret, body, { timestamp: new Date(Date.now() - 10 * 60_000) }),
    );
    expect(verifyWebhook(body, stale, secret)).toMatchObject({ reason: "bad_signature" });
  });

  it("rejects a validly signed body that is not an event", () => {
    const junk = "not json";
    expect(verifyWebhook(junk, new Headers(signWebhook(secret, junk)), secret)).toMatchObject({
      reason: "bad_payload",
    });
  });

  it("covers every event type the SDK knows", () => {
    expect(SUPPORTED_EVENT_TYPES).toHaveLength(19);
    expect(new Set(SUPPORTED_EVENT_TYPES).size).toBe(19);
  });
});
