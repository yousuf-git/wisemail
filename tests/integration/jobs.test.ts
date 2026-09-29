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
});
