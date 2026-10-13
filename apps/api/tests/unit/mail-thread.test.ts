import { describe, expect, it } from "vitest";

import {
  extractMessageIds,
  hashMessageId,
  normalizeSubject,
  parentCandidates,
  resolveThread,
  SUBJECT_WINDOW_DAYS,
  type ThreadCandidate,
  type ThreadingInput,
  type ThreadingLookups,
} from "@/lib/mail/thread";

const day = 86_400_000;
const now = new Date("2026-09-29T12:00:00Z");

function lookups(options: {
  byId?: Record<string, string>;
  tombstoned?: string[];
  threads?: ThreadCandidate[];
}): ThreadingLookups {
  return {
    async threadsByMessageId(ids) {
      return new Map(
        ids.flatMap((id) => (options.byId?.[id] ? [[id, options.byId[id]!] as const] : [])),
      );
    },
    async tombstonedHashes(hashes) {
      const dead = new Set((options.tombstoned ?? []).map(hashMessageId));
      return new Set(hashes.filter((h) => dead.has(h)));
    },
    async threadsBySubject(key) {
      return (options.threads ?? []).filter((t) => t.subjectKey === key);
    },
  };
}

const input = (overrides: Partial<ThreadingInput> = {}): ThreadingInput => ({
  subject: "Invoice question",
  participants: ["jane@customer.test"],
  mailboxAddress: "support@acme.com",
  at: now,
  ...overrides,
});

const candidate = (overrides: Partial<ThreadCandidate> = {}): ThreadCandidate => ({
  threadId: "t1",
  subjectKey: "invoice question",
  participants: ["jane@customer.test"],
  mailboxAddress: "support@acme.com",
  lastMessageAt: new Date(now.getTime() - 2 * day),
  ...overrides,
});

describe("normalizeSubject", () => {
  it("strips repeated reply and forward prefixes in several languages", () => {
    expect(normalizeSubject("Re: Re: FWD: Fw: Invoice  question")).toBe("Invoice question");
    expect(normalizeSubject("RE[2]: hello")).toBe("hello");
    expect(normalizeSubject("AW: SV: Antw: Angebot")).toBe("Angebot");
    expect(normalizeSubject("  Re:   ")).toBe("");
    expect(normalizeSubject(undefined)).toBe("");
  });

  it("keeps words that only look like prefixes", () => {
    expect(normalizeSubject("Regarding the invoice")).toBe("Regarding the invoice");
    expect(normalizeSubject("Reset: your password")).toBe("Reset: your password");
  });
});

describe("message id headers", () => {
  it("extracts ids in order, with or without brackets", () => {
    expect(extractMessageIds("<a@x> <b@y>\r\n <c@z>")).toEqual(["<a@x>", "<b@y>", "<c@z>"]);
    expect(extractMessageIds("a@x")).toEqual(["<a@x>"]);
    expect(extractMessageIds(undefined)).toEqual([]);
  });

  it("orders candidates nearest first and dedupes", () => {
    expect(
      parentCandidates({ inReplyTo: "<c@x>", references: ["<a@x>", "<b@x>", "<c@x>"] }),
    ).toEqual(["<c@x>", "<b@x>", "<a@x>"]);
  });

  it("hashes case-insensitively and without brackets", () => {
    expect(hashMessageId("<ABC@x.com>")).toBe(hashMessageId("abc@x.com"));
    expect(hashMessageId("<a@x>")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("resolveThread", () => {
  it("joins the thread of In-Reply-To", async () => {
    const decision = await resolveThread(
      input({ inReplyTo: "<m2@x>", references: ["<m1@x>", "<m2@x>"] }),
      lookups({ byId: { "<m2@x>": "T2", "<m1@x>": "T1" } }),
    );
    expect(decision).toEqual({ kind: "existing", threadId: "T2", via: "message_id" });
  });

  it("falls back to References when In-Reply-To is unknown, nearest first", async () => {
    const decision = await resolveThread(
      input({ inReplyTo: "<gone@x>", references: ["<m1@x>", "<m2@x>", "<gone@x>"] }),
      lookups({ byId: { "<m1@x>": "T1", "<m2@x>": "T2" } }),
    );
    expect(decision).toEqual({ kind: "existing", threadId: "T2", via: "message_id" });
  });

  it("matches by normalized subject + participant + mailbox within the window", async () => {
    const decision = await resolveThread(
      input({ subject: "RE: Invoice   Question" }),
      lookups({ threads: [candidate()] }),
    );
    expect(decision).toEqual({ kind: "existing", threadId: "t1", via: "subject" });
  });

  it("does not use the subject fallback outside the window", async () => {
    const old = candidate({
      lastMessageAt: new Date(now.getTime() - (SUBJECT_WINDOW_DAYS + 1) * day),
    });
    expect(await resolveThread(input(), lookups({ threads: [old] }))).toEqual({
      kind: "new",
      reason: "no_match",
    });
  });

  it("requires a shared participant and the same mailbox", async () => {
    const stranger = candidate({ participants: ["someone@else.test"] });
    const otherBox = candidate({ threadId: "t2", mailboxAddress: "sales@acme.com" });
    expect(await resolveThread(input(), lookups({ threads: [stranger, otherBox] }))).toEqual({
      kind: "new",
      reason: "no_match",
    });
  });

  it("is deterministic: newest thread wins, ties break by id", async () => {
    const a = candidate({ threadId: "a", lastMessageAt: new Date(now.getTime() - day) });
    const b = candidate({ threadId: "b", lastMessageAt: new Date(now.getTime() - day) });
    const c = candidate({ threadId: "c", lastMessageAt: new Date(now.getTime() - 3 * day) });
    const first = await resolveThread(input(), lookups({ threads: [a, b, c] }));
    const second = await resolveThread(input(), lookups({ threads: [c, b, a] }));
    expect(first).toEqual(second);
    expect(first).toEqual({ kind: "existing", threadId: "b", via: "subject" });
  });

  it("never subject-matches an empty subject", async () => {
    expect(
      await resolveThread(
        input({ subject: "Re:" }),
        lookups({ threads: [candidate({ subjectKey: "" })] }),
      ),
    ).toEqual({ kind: "new", reason: "empty_subject" });
  });

  it("starts a new thread when the parent was permanently deleted (tombstone)", async () => {
    const decision = await resolveThread(
      input({ inReplyTo: "<deleted@x>" }),
      lookups({
        byId: { "<deleted@x>": "T-old" },
        tombstoned: ["<deleted@x>"],
        threads: [candidate()],
      }),
    );
    // No re-link through the id, and no subject fallback into the old conversation either.
    expect(decision).toEqual({ kind: "new", reason: "tombstoned_parent" });
  });

  it("still uses a live parent when only an older reference is tombstoned", async () => {
    const decision = await resolveThread(
      input({ inReplyTo: "<live@x>", references: ["<deleted@x>", "<live@x>"] }),
      lookups({ byId: { "<live@x>": "T-live" }, tombstoned: ["<deleted@x>"] }),
    );
    expect(decision).toEqual({ kind: "existing", threadId: "T-live", via: "message_id" });
  });
});
