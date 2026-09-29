import "server-only";

import { createHash } from "node:crypto";

import { mapResendError } from "./errors";
import type { ResendAdapter } from "./adapter";
import type {
  CreatedResendWebhook,
  Page,
  PageOptions,
  ResendApiKey,
  ResendDomain,
  ResendEventType,
} from "./types";

/**
 * In-memory Resend for dev and tests (RESEND_MODE=fake). Deterministic and configurable through
 * the API key string, so the whole connect flow can be exercised in a browser without Resend.
 *
 * Key format: `re_<team>[_<trigger>…]`. The first segment after `re_` is the Resend *team*: two
 * keys with the same team are the same account (dedupe test). Later segments switch behaviour:
 *
 *   sending    sending-only key: every management call is forbidden (401 restricted_api_key)
 *   invalid    Resend rejects the key (invalid_api_key)
 *   ratelimit  every call answers 429
 *   slotfull   the account has no free webhook slot (creating a webhook is a validation error)
 *   nodomains  the team has no domains (identity then comes from the API key list)
 *
 * Anything else is a healthy full-access key. Webhook signing secrets are real Svix secrets, so
 * signatures made with them verify through the same path as live mode.
 */

export type FakeBehavior = "full" | "sending" | "invalid" | "ratelimit";

export type FakeWebhook = {
  id: string;
  endpoint: string;
  events: ResendEventType[];
  signingSecret: string;
  createdAt: string;
};

export type FakeTeam = {
  id: string;
  domains: ResendDomain[];
  apiKeys: ResendApiKey[];
  webhooks: Map<string, FakeWebhook>;
};

/** Resend Pro allows 5 webhook endpoints (PRD §5.1). */
export const FAKE_WEBHOOK_LIMIT = 5;

type Store = { teams: Map<string, FakeTeam>; counter: number };
const globalForFake = globalThis as unknown as { __wisemailFakeResend?: Store };

/** Shared through `globalThis`: Next.js may load this module more than once per process. */
export function fakeStore(): Store {
  globalForFake.__wisemailFakeResend ??= { teams: new Map(), counter: 0 };
  return globalForFake.__wisemailFakeResend;
}

export function resetFakeResend(): void {
  globalForFake.__wisemailFakeResend = undefined;
}

export function parseFakeKey(apiKey: string): { team: string; flags: Set<string> } {
  const parts = apiKey.replace(/^re_/, "").split("_").filter(Boolean);
  const [team = "default", ...flags] = parts;
  return { team: team.toLowerCase(), flags: new Set(flags.map((f) => f.toLowerCase())) };
}

function behaviorOf(flags: Set<string>): FakeBehavior {
  if (flags.has("invalid")) return "invalid";
  if (flags.has("ratelimit")) return "ratelimit";
  if (flags.has("sending")) return "sending";
  return "full";
}

const sha = (s: string) => createHash("sha256").update(s).digest();

function teamFor(id: string, flags: Set<string>): FakeTeam {
  const store = fakeStore();
  let team = store.teams.get(id);
  if (!team) {
    const slug = id.replace(/[^a-z0-9]/g, "") || "team";
    team = {
      id,
      domains: flags.has("nodomains")
        ? []
        : [
            {
              id: `dom_${slug}_1`,
              name: `${slug}.example.com`,
              status: "verified",
              region: "us-east-1",
              createdAt: "2026-01-01T00:00:00.000Z",
              openTracking: false,
              clickTracking: false,
            },
          ],
      // The team's original key (it exists before any key is pasted into Wisemail).
      apiKeys: [
        {
          id: `key_${slug}_1`,
          name: "Onboarding",
          createdAt: "2025-12-01T00:00:00.000Z",
          lastUsedAt: null,
        },
      ],
      webhooks: new Map(),
    };
    store.teams.set(id, team);
  }
  return team;
}

function fail(name: string, message: string, statusCode: number, headers?: Record<string, string>) {
  return mapResendError({ name, message, statusCode }, headers ?? null);
}

function paginate<T extends { id: string }>(items: T[], options: PageOptions = {}): Page<T> {
  // Newest first, like Resend.
  const sorted = [...items].sort((a, b) => b.id.localeCompare(a.id));
  const start = options.after ? sorted.findIndex((i) => i.id === options.after) + 1 : 0;
  const limit = options.limit ?? 20;
  const data = sorted.slice(start, start + limit);
  const hasMore = start + limit < sorted.length;
  return { data, hasMore, nextCursor: hasMore ? data.at(-1)?.id : undefined };
}

export class FakeResendAdapter implements ResendAdapter {
  private readonly team: FakeTeam;
  private readonly flags: Set<string>;
  private readonly behavior: FakeBehavior;
  private readonly ownKey: ResendApiKey;

  constructor(apiKey: string) {
    const parsed = parseFakeKey(apiKey);
    this.flags = parsed.flags;
    this.behavior = behaviorOf(parsed.flags);
    this.team = teamFor(parsed.team, parsed.flags);
    // The pasted key itself shows up in the team's key list, like in Resend.
    const hash = sha(apiKey).toString("hex").slice(0, 12);
    this.ownKey = {
      id: `key_${hash}`,
      name: "Wisemail",
      createdAt: "2026-06-01T00:00:00.000Z",
      lastUsedAt: null,
    };
  }

  private guard(managementOnly = true) {
    if (this.behavior === "invalid") throw fail("invalid_api_key", "API key is invalid", 400);
    if (this.behavior === "ratelimit") {
      throw fail("rate_limit_exceeded", "Too many requests", 429, { "retry-after": "1" });
    }
    if (this.behavior === "sending" && managementOnly) {
      throw fail("restricted_api_key", "This API key is restricted to only send emails", 401);
    }
  }

  async listDomains(options?: PageOptions) {
    this.guard();
    return paginate(this.team.domains, options);
  }

  async listApiKeys(options?: PageOptions) {
    this.guard();
    const keys = this.team.apiKeys.some((k) => k.id === this.ownKey.id)
      ? this.team.apiKeys
      : [...this.team.apiKeys, this.ownKey];
    return paginate(keys, options);
  }

  async createWebhook(input: {
    endpoint: string;
    events: readonly ResendEventType[];
  }): Promise<CreatedResendWebhook> {
    this.guard();
    if (this.flags.has("slotfull") || this.team.webhooks.size >= FAKE_WEBHOOK_LIMIT) {
      throw fail(
        "validation_error",
        "You have reached the maximum number of webhooks for your plan. Delete one and try again.",
        422,
      );
    }
    const store = fakeStore();
    const id = `wh_fake_${String(++store.counter).padStart(4, "0")}`;
    const signingSecret = `whsec_${sha(`fake-signing-secret:${this.team.id}:${id}`).toString("base64")}`;
    this.team.webhooks.set(id, {
      id,
      endpoint: input.endpoint,
      events: [...input.events],
      signingSecret,
      createdAt: new Date().toISOString(),
    });
    return { id, signingSecret };
  }

  async deleteWebhook(id: string) {
    this.guard();
    if (!this.team.webhooks.delete(id)) throw fail("not_found", "Webhook not found", 404);
  }
}
