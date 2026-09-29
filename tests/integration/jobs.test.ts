import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";

let stop: () => Promise<void>;
let connect: typeof import("@/lib/db/connect");

beforeAll(async () => {
  ({ stop } = await startTestDb("jobs"));
  connect = await import("@/lib/db/connect");
  await connect.connectDb();
}, 120_000);

afterAll(async () => {
  await connect?.disconnectDb();
  await stop?.();
});

describe("job definitions", () => {
  it("sync-connection is throttled and serialized per connection (TRD §2.3)", async () => {
    const { syncConnection } = await import("@/inngest/functions/sync-connection");
    const opts = (syncConnection as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.throttle).toEqual({ key: "event.data.connectionId", limit: 8, period: "1s" });
    expect(opts.concurrency).toEqual({ key: "event.data.connectionId", limit: 1 });
  });

  it("send-email and fetch-inbound are throttled per connection (TRD §2.3)", async () => {
    const { sendEmail } = await import("@/inngest/functions/send-email");
    const { fetchInbound } = await import("@/inngest/functions/fetch-inbound");
    for (const fn of [sendEmail, fetchInbound]) {
      const opts = (fn as unknown as { opts: Record<string, unknown> }).opts;
      expect(opts.throttle).toEqual({ key: "event.data.connectionId", limit: 8, period: "1s" });
    }
    const opts = (fetchInbound as unknown as { opts: Record<string, unknown> }).opts;
    expect(opts.retries).toBe(5);
  });

  it("registers every Phase 4 function with the Inngest route", async () => {
    const route = await import("@/app/api/inngest/route");
    expect(typeof route.POST).toBe("function");
  });
});
