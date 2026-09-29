import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startTestDb } from "./helpers";
import { loadMail, seedOrg, storeEvent, tinyPng, type Mail, type Seed } from "./mail-helpers";

// The route only needs the session; everything else in the DAL is unrelated to this test.
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/dal", () => ({ getSession: async () => session.current }));

let stop: () => Promise<void>;
let m: Mail;
let route: typeof import("@/app/api/files/[attachmentId]/route");
let devStorage: typeof import("@/app/api/dev-storage/[token]/route");

beforeAll(async () => {
  ({ stop } = await startTestDb("mail-files"));
  m = await loadMail();
  route = await import("@/app/api/files/[attachmentId]/route");
  devStorage = await import("@/app/api/dev-storage/[token]/route");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  m.fake.resetFakeResend();
  session.current = null;
});

async function member(orgId: Types.ObjectId, role: string) {
  const userId = new Types.ObjectId();
  await mongoose.connection.collection("member").insertOne({ organizationId: orgId, userId, role });
  return userId.toHexString();
}

async function attachmentFor(seed: Seed) {
  const inbound = m.fake.createFakeReceivedEmail(seed.key, {
    from: "jane@customer.test",
    to: [seed.mailbox],
    subject: "Files",
    text: "x",
    attachments: [
      {
        filename: "Rechnung März ✓.pdf",
        contentType: "application/pdf",
        content: "%PDF-1.4 secret",
      },
    ],
  });
  const processed = await m.processing.processWebhookEvent(
    await storeEvent(m, seed, "email.received", inbound.event as never),
  );
  await m.inbound.fetchInboundEmail({ emailId: processed.emailId! });
  return (await m.models.AttachmentModel.findOne({ emailId: processed.emailId }))!;
}

const call = (attachmentId: string) =>
  route.GET(new Request(`http://localhost/api/files/${attachmentId}`), {
    params: Promise.resolve({ attachmentId }),
  });

describe("GET /api/files/[attachmentId]", () => {
  it("redirects a member to a short-lived presigned URL that downloads under the original name", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const att = await attachmentFor(seed);
    session.current = { user: { id: await member(seed.orgId, "viewer") } };

    const res = await call(att._id.toHexString());
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toMatch(/\/api\/dev-storage\//);
    expect(res.headers.get("cache-control")).toContain("no-store");

    // Follow it: attachment disposition with the exact UTF-8 filename, original type.
    const file = await devStorage.GET(new Request(location), {
      params: Promise.resolve({ token: location.split("/").pop()! }),
    });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    const disposition = file.headers.get("content-disposition")!;
    expect(disposition).toContain("attachment;");
    expect(disposition).toContain("filename*=UTF-8''Rechnung%20M%C3%A4rz%20%E2%9C%93.pdf");
    expect(await file.text()).toBe("%PDF-1.4 secret");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("requires a session", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const att = await attachmentFor(seed);
    expect((await call(att._id.toHexString())).status).toBe(401);
  });

  it("denies members of another org and non-members, indistinguishable from a missing file", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const otherOrg = await seedOrg(m, { plan: "pro" });
    const att = await attachmentFor(seed);

    session.current = { user: { id: await member(otherOrg.orgId, "owner") } };
    const denied = await call(att._id.toHexString());
    expect(denied.status).toBe(404);
    const missing = await call(new Types.ObjectId().toHexString());
    expect(missing.status).toBe(404);
    expect(await denied.text()).toBe(await missing.text());

    session.current = { user: { id: new Types.ObjectId().toHexString() } };
    expect((await call(att._id.toHexString())).status).toBe(404);
    expect((await call("not-an-id")).status).toBe(404);
  });

  it("applies project scope: a member scoped to another project gets 404", async () => {
    const p1 = new Types.ObjectId();
    const p2 = new Types.ObjectId();
    const seed = await seedOrg(m, { plan: "pro", projectId: p1 });
    const att = await attachmentFor(seed);
    const userId = await member(seed.orgId, "support");
    session.current = { user: { id: userId } };

    // Unscoped member: allowed.
    expect((await call(att._id.toHexString())).status).toBe(302);

    const memberDoc = await mongoose.connection
      .collection("member")
      .findOne({ userId: new Types.ObjectId(userId) });
    await m.models.MemberScopeModel.create({
      orgId: seed.orgId,
      memberId: memberDoc!._id,
      projectIds: [p2],
    });
    expect((await call(att._id.toHexString())).status).toBe(404);
    await m.models.MemberScopeModel.updateOne(
      { memberId: memberDoc!._id },
      { $set: { projectIds: [p1] } },
    );
    expect((await call(att._id.toHexString())).status).toBe(302);
  });

  it("keeps draft uploads private to their uploader", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const uploader = await member(seed.orgId, "support");
    const colleague = await member(seed.orgId, "support");
    const draft = await m.models.DraftModel.create({
      orgId: seed.orgId,
      userId: new Types.ObjectId(uploader),
    });
    const att = await m.models.AttachmentModel.create({
      orgId: seed.orgId,
      draftId: draft._id,
      uploadedBy: new Types.ObjectId(uploader),
      direction: "outbound",
      filename: "draft.png",
      contentType: "image/png",
      size: tinyPng.length,
      storageMode: "r2",
      storageKey: `drafts/${seed.orgId}/${draft._id}/x`,
    });
    await m.storage.getStore().put(att.storageKey!, tinyPng, { contentType: "image/png" });
    session.current = { user: { id: colleague } };
    expect((await call(att._id.toHexString())).status).toBe(404);
    session.current = { user: { id: uploader } };
    expect((await call(att._id.toHexString())).status).toBe(302);
  });

  it("says so when the file is no longer available", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const att = await attachmentFor(seed);
    await m.models.AttachmentModel.updateOne(
      { _id: att._id },
      { $set: { availability: "unavailable" } },
    );
    session.current = { user: { id: await member(seed.orgId, "owner") } };
    const res = await call(att._id.toHexString());
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: "unavailable" });
  });
});

describe("dev storage route", () => {
  it("refuses forged and expired tokens", async () => {
    const fake = await import("@/lib/storage/fake");
    const expired = fake.signFakeToken({ m: "get", k: "orgs/x/y", e: Date.now() - 1 });
    const bogus = "abc.def";
    for (const token of [expired, bogus]) {
      const res = await devStorage.GET(new Request("http://localhost/x"), {
        params: Promise.resolve({ token }),
      });
      expect(res.status).toBe(404);
    }
    const put = fake.signFakeToken({
      m: "put",
      k: "orgs/x/y",
      e: Date.now() + 60_000,
      size: 1,
      contentType: "text/plain",
    });
    const asGet = await devStorage.GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ token: put }),
    });
    expect(asGet.status).toBe(404);
  });
});
