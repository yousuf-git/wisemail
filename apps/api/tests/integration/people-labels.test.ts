import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";
import { ctxFor, loadMail, seedOrg, type Mail } from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;

beforeAll(async () => {
  ({ stop } = await startTestDb("people-labels"));
  m = await loadMail();
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

async function inboundThread(
  seed: Awaited<ReturnType<typeof seedOrg>>,
  from: { address: string; name?: string },
  at = new Date(),
) {
  const thread = await m.models.ThreadModel.create({
    orgId: seed.orgId,
    connectionId: seed.connectionId,
    domainId: seed.domain._id,
    mailboxAddress: seed.mailbox,
    subject: `From ${from.address}`,
    participants: [from.address.toLowerCase()],
    messageCount: 1,
    lastMessageAt: at,
    lastInboundAt: at,
  });
  await m.models.EmailModel.create({
    orgId: seed.orgId,
    connectionId: seed.connectionId,
    direction: "inbound",
    origin: "external",
    domainId: seed.domain._id,
    threadId: thread._id,
    from,
    to: [{ address: seed.mailbox }],
    subject: thread.subject,
    status: "received",
    receivedAt: at,
  });
  return thread;
}

describe("thread list sender labels", () => {
  it("uses the display name from the messages and falls back to the address", async () => {
    const seed = await seedOrg(m);
    await inboundThread(
      seed,
      { address: "Jane.Doe@northwind.io", name: "Jane Doe" },
      new Date(Date.now() - 1000),
    );
    await inboundThread(seed, { address: "no-name@example.net" });
    const ctx = ctxFor(m, seed.orgId, "owner");
    const page = await m.emails.listThreads(ctx, { folder: "inbox" });
    const byAddress = new Map(page.items.map((r) => [r.people[0], r]));
    expect(byAddress.get("jane.doe@northwind.io")).toMatchObject({ peopleLabels: ["Jane Doe"] });
    expect(byAddress.get("no-name@example.net")).toMatchObject({
      peopleLabels: ["no-name@example.net"],
    });
  });

  it("the newest name for an address wins; other orgs' names never leak in", async () => {
    const seed = await seedOrg(m);
    const other = await seedOrg(m);
    await inboundThread(other, { address: "shared@customer.test", name: "Leaked Name" });
    const thread = await inboundThread(seed, { address: "shared@customer.test", name: "Old Name" });
    await m.models.EmailModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      direction: "inbound",
      origin: "external",
      threadId: thread._id,
      from: { address: "shared@customer.test", name: "New Name" },
      to: [{ address: seed.mailbox }],
      subject: "again",
      status: "received",
      receivedAt: new Date(),
      createdAt: new Date(Date.now() + 5000),
    });
    const page = await m.emails.listThreads(ctxFor(m, seed.orgId, "owner"), { folder: "inbox" });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.peopleLabels).toEqual(["New Name"]);
    expect(new Types.ObjectId(page.items[0]!.id)).toEqual(thread._id);
  });

  it("sent rows label recipients by name", async () => {
    const seed = await seedOrg(m);
    await m.models.EmailModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      direction: "outbound",
      origin: "app",
      domainId: seed.domain._id,
      from: { address: seed.mailbox },
      to: [{ address: "bob@example.net", name: "Bob Builder" }, { address: "amy@example.net" }],
      subject: "Hello",
      status: "delivered",
      sentAt: new Date(),
    });
    const page = await m.emails.listThreads(ctxFor(m, seed.orgId, "owner"), { folder: "sent" });
    expect(page.items[0]).toMatchObject({
      people: ["bob@example.net", "amy@example.net"],
      peopleLabels: ["Bob Builder", "amy@example.net"],
    });
  });
});
