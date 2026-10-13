import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResendError } from "@/lib/resend/errors";
import { FakeResendAdapter, resetFakeResend } from "@/lib/resend/fake-adapter";
import { collectAll, iteratePages, singlePage, toPage } from "@/lib/resend/pagination";
import { withRateLimitRetry } from "@/lib/resend/retry";
import type { Page } from "@/lib/resend/types";

describe("toPage", () => {
  it("uses the last id as the cursor only when there is more", () => {
    const more = toPage({ data: [{ id: "a" }, { id: "b" }], has_more: true }, (x) => x.id);
    expect(more).toEqual({ data: ["a", "b"], hasMore: true, nextCursor: "b" });
    const done = toPage({ data: [{ id: "a" }], has_more: false }, (x) => x.id);
    expect(done).toEqual({ data: ["a"], hasMore: false, nextCursor: undefined });
  });

  it("never claims more pages from an empty page", () => {
    expect(toPage({ data: [] as { id: string }[], has_more: true }, (x) => x.id).hasMore).toBe(
      false,
    );
  });

  it("singlePage is one complete page", () => {
    expect(singlePage([1, 2])).toEqual({ data: [1, 2], hasMore: false, nextCursor: undefined });
  });
});

/** A list over 1..n with Resend-style cursors (the last id of the previous page). */
function numbers(n: number) {
  const calls: { limit?: number; after?: string }[] = [];
  const list = async (options: { limit?: number; after?: string }): Promise<Page<string>> => {
    calls.push(options);
    const ids = Array.from({ length: n }, (_, i) => `id${String(i + 1).padStart(2, "0")}`);
    const start = options.after ? ids.indexOf(options.after) + 1 : 0;
    const data = ids.slice(start, start + (options.limit ?? 20));
    const hasMore = start + data.length < n;
    return { data, hasMore, nextCursor: hasMore ? data.at(-1) : undefined };
  };
  return { list, calls };
}

describe("iteratePages / collectAll", () => {
  it("walks every page with the previous cursor", async () => {
    const { list, calls } = numbers(7);
    const pages: string[][] = [];
    for await (const page of iteratePages(list, { limit: 3 })) pages.push(page);
    expect(pages.map((p) => p.length)).toEqual([3, 3, 1]);
    expect(calls.map((c) => c.after)).toEqual([undefined, "id03", "id06"]);
    expect(calls.every((c) => c.limit === 3)).toBe(true);
  });

  it("can start from a saved cursor", async () => {
    const { list } = numbers(7);
    expect((await collectAll((o) => list({ ...o, after: o.after ?? "id05" }))).length).toBe(2);
  });

  it("collects everything, and handles an empty list", async () => {
    expect(await collectAll(numbers(45).list, { limit: 20 })).toHaveLength(45);
    expect(await collectAll(numbers(0).list)).toEqual([]);
  });

  it("stops on a repeated cursor or a missing one instead of looping", async () => {
    let calls = 0;
    const stuck = async (): Promise<Page<string>> => {
      calls++;
      return { data: ["x"], hasMore: true, nextCursor: "same" };
    };
    await collectAll(stuck);
    expect(calls).toBe(2); // first page, then the repeated cursor ends it
    const noCursor = async (): Promise<Page<string>> => ({ data: ["x"], hasMore: true });
    expect(await collectAll(noCursor)).toEqual(["x"]);
  });

  it("propagates errors from a page", async () => {
    const boom = async (): Promise<Page<string>> => {
      throw new ResendError("resend_unknown", "boom");
    };
    await expect(collectAll(boom)).rejects.toMatchObject({ code: "resend_unknown" });
  });
});

describe("withRateLimitRetry", () => {
  const limited = (seconds?: number) =>
    new ResendError("resend_rate_limited", "slow down", { retryAfterSeconds: seconds });

  it("waits for retry-after (capped) and retries", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(limited(2))
      .mockRejectedValueOnce(limited(60))
      .mockResolvedValue("ok");
    await expect(withRateLimitRetry(fn, { sleep, maxWaitMs: 5000 })).resolves.toBe("ok");
    expect(sleep.mock.calls).toEqual([[2000], [5000]]);
  });

  it("gives up after the attempts and never retries other errors", async () => {
    const sleep = vi.fn(async () => {});
    const always = vi.fn().mockRejectedValue(limited());
    await expect(withRateLimitRetry(always, { sleep, attempts: 2 })).rejects.toMatchObject({
      code: "resend_rate_limited",
    });
    expect(always).toHaveBeenCalledTimes(2);
    const forbidden = vi.fn().mockRejectedValue(new ResendError("resend_forbidden", "no"));
    await expect(withRateLimitRetry(forbidden, { sleep })).rejects.toMatchObject({
      code: "resend_forbidden",
    });
    expect(forbidden).toHaveBeenCalledTimes(1);
  });
});

describe("FakeResendAdapter seeded data", () => {
  beforeEach(() => resetFakeResend());

  it("seeds mixed domains: one without open tracking, one without receiving, one pending", async () => {
    const adapter = new FakeResendAdapter("re_seed_full");
    const domains = await collectAll((o) => adapter.listDomains(o));
    expect(domains).toHaveLength(3);
    expect(domains.filter((d) => !d.openTracking)).toHaveLength(1);
    expect(domains.filter((d) => !d.capabilities?.receiving).length).toBeGreaterThanOrEqual(1);
    expect(domains.map((d) => d.status).sort()).toEqual(["pending", "verified", "verified"]);
    const detail = await adapter.getDomain(domains.find((d) => d.status === "pending")!.id);
    expect(detail.records.some((r) => r.status === "pending")).toBe(true);
  });

  it("is deterministic per team and isolated between teams", async () => {
    const a = await collectAll((o) => new FakeResendAdapter("re_one").listContacts(o));
    resetFakeResend();
    const b = await collectAll((o) => new FakeResendAdapter("re_one").listContacts(o));
    expect(a).toEqual(b);
    const other = new FakeResendAdapter("re_two");
    await new FakeResendAdapter("re_one").updateDomain({ id: "dom_one_1", openTracking: true });
    expect((await other.getDomain("dom_two_1")).openTracking).toBe(false);
  });

  it("paginates like Resend and filters contacts by segment", async () => {
    const adapter = new FakeResendAdapter("re_pg_manycontacts");
    const first = await adapter.listContacts({ limit: 100 });
    expect(first).toMatchObject({ hasMore: true });
    expect(first.data).toHaveLength(100);
    expect(await collectAll((o) => adapter.listContacts(o), { limit: 100 })).toHaveLength(230);
    const beta = await collectAll((o) => adapter.listContacts({ ...o, segmentId: "seg_pg_3" }));
    expect(beta).toHaveLength(46);
  });

  it("updateDomain flips tracking and unknown domains are not found", async () => {
    const adapter = new FakeResendAdapter("re_upd");
    await adapter.updateDomain({ id: "dom_upd_1", openTracking: true, clickTracking: false });
    expect(await adapter.getDomain("dom_upd_1")).toMatchObject({
      openTracking: true,
      clickTracking: false,
    });
    await expect(adapter.updateDomain({ id: "nope", openTracking: true })).rejects.toMatchObject({
      code: "resend_not_found",
    });
  });

  it("ratelimitsync answers 429 once for templates, allgood is fully green", async () => {
    const limited = new FakeResendAdapter("re_rl_ratelimitsync");
    await expect(limited.listTemplates()).rejects.toMatchObject({
      code: "resend_rate_limited",
      details: { retryAfterSeconds: 1 },
    });
    expect((await limited.listTemplates()).data.length).toBeGreaterThan(0);

    const good = new FakeResendAdapter("re_ok_allgood");
    const domains = await collectAll((o) => good.listDomains(o));
    expect(
      domains.every(
        (d) =>
          d.status === "verified" && d.openTracking && d.clickTracking && d.capabilities?.receiving,
      ),
    ).toBe(true);
  });

  it("management calls on a sending-only key are forbidden", async () => {
    const adapter = new FakeResendAdapter("re_x_sending");
    await expect(adapter.listTemplates()).rejects.toMatchObject({ code: "resend_forbidden" });
    await expect(adapter.getContact("con_x_001")).rejects.toMatchObject({
      code: "resend_forbidden",
    });
  });
});
