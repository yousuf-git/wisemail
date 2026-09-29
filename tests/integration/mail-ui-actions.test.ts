import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startTestDb, uniqueEmail } from "./helpers";
import { loadMail, type Mail } from "./mail-helpers";

const headerState = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => headerState.current,
  cookies: async () => ({ set() {}, get() {}, delete() {}, getAll: () => [] }),
}));

let stop: () => Promise<void>;
let m: Mail;
let auth: typeof import("@/lib/auth/server").auth;
let compose: typeof import("@/app/(app)/[orgSlug]/compose/actions");
let senderActions: typeof import("@/app/(app)/[orgSlug]/settings/senders/actions");

beforeAll(async () => {
  ({ stop } = await startTestDb("mail-ui-actions"));
  m = await loadMail();
  auth = (await import("@/lib/auth/server")).auth;
  compose = await import("@/app/(app)/[orgSlug]/compose/actions");
  senderActions = await import("@/app/(app)/[orgSlug]/settings/senders/actions");
}, 120_000);

afterAll(async () => {
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  m.fake.resetFakeResend();
  m.jobs.resetSentJobs();
});

type Role = "owner" | "admin" | "developer" | "support" | "viewer";
type User = { id: string; headers: Headers };
let counter = 0;

async function signUp(name: string): Promise<User> {
  const res = await auth.api.signUpEmail({
    body: { name, email: uniqueEmail(name.toLowerCase()), password: "correct horse battery" },
    returnHeaders: true,
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { id: res.response.user.id, headers: new Headers({ cookie }) };
}

/** A real Better Auth org with one member per role, an active connection and a verified domain. */
async function setup() {
  const owner = await signUp("Owner");
  const slug = `ui-org-${++counter}`;
  const org = await auth.api.createOrganization({
    headers: owner.headers,
    body: { name: slug, slug },
  });
  const orgId = new Types.ObjectId(org.id);
  await m.models.OrgSettingsModel.updateOne({ orgId }, { plan: "team" });
  const users: Record<Role, User> = {
    owner,
    admin: owner,
    developer: owner,
    support: owner,
    viewer: owner,
  };
  for (const role of ["admin", "developer", "support", "viewer"] as const) {
    users[role] = await signUp(role);
    await auth.api.addMember({ body: { userId: users[role].id, organizationId: org.id, role } });
  }

  const team = `ui${counter}${Date.now().toString(36)}`;
  const key = `re_${team}_full`;
  const connectionId = new Types.ObjectId();
  const adapter = new m.fake.FakeResendAdapter(key);
  const webhook = await adapter.createWebhook({
    endpoint: `http://localhost/${connectionId}`,
    events: ["email.sent"],
  });
  await m.models.ConnectionModel.create({
    _id: connectionId,
    orgId,
    name: `conn-${connectionId}`,
    resendTeamFingerprint: `fp-${connectionId}`,
    createdBy: new Types.ObjectId(),
    status: "active",
    apiKey: m.envelope.encryptSecret(key, { aad: m.hook.keyAad(connectionId) }),
    apiKeyLast4: key.slice(-4),
    webhook: {
      resendId: webhook.id,
      signingSecret: m.envelope.encryptSecret(webhook.signingSecret, {
        aad: m.hook.secretAad(connectionId),
      }),
      events: ["email.sent"],
      registeredAt: new Date(),
    },
  });
  const domainName = `${team}.example.com`;
  const domain = await m.models.DomainModel.create({
    orgId,
    connectionId,
    resendId: `dom_${team}_1`,
    name: domainName,
    status: "verified",
    receiving: { enabled: true, mxVerified: true },
  });
  const as = (role: Role) => {
    headerState.current = users[role].headers;
  };
  return { slug, orgId, domain, domainName, as, users };
}

const denied = { ok: false, error: { code: "forbidden" } };

describe("compose actions: permissions", () => {
  it("rejects every draft, upload and send action for a viewer", async () => {
    const t = await setup();
    t.as("viewer");
    const id = "a".repeat(24);
    const results = await Promise.all([
      compose.saveDraftAction(t.slug, { subject: "x" }),
      compose.getDraftAction(t.slug, { id }),
      compose.deleteDraftAction(t.slug, { id }),
      compose.sendEmailAction(t.slug, {
        senderId: id,
        to: ["a@b.co"],
        subject: "x",
        html: "<p>x</p>",
      }),
      compose.cancelScheduledAction(t.slug, { emailId: id }),
      compose.createUploadAction(t.slug, {
        draftId: id,
        filename: "a.txt",
        size: 3,
        contentType: "text/plain",
      }),
      compose.confirmUploadAction(t.slug, { draftId: id, attachmentId: id }),
      compose.removeAttachmentAction(t.slug, { draftId: id, attachmentId: id }),
    ]);
    for (const result of results) expect(result).toMatchObject(denied);
  });

  it("asks unauthenticated callers to sign in", async () => {
    const t = await setup();
    headerState.current = new Headers();
    expect(await compose.saveDraftAction(t.slug, { subject: "x" })).toMatchObject({
      ok: false,
      error: { code: "unauthenticated" },
    });
  });

  it("does not let another org's member act in this org", async () => {
    const t = await setup();
    const other = await setup();
    headerState.current = other.users.owner.headers;
    expect(await compose.saveDraftAction(t.slug, { subject: "x" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("sender actions: permissions", () => {
  it("lets Owner, Admin and Developer manage senders but not Support or Viewer", async () => {
    const t = await setup();
    const input = { domainId: t.domain._id.toHexString(), localPart: "hello" };

    for (const role of ["support", "viewer"] as const) {
      t.as(role);
      expect(await senderActions.createSenderAction(t.slug, input)).toMatchObject(denied);
      expect(
        await senderActions.updateSenderAction(t.slug, { id: "a".repeat(24), version: 0 }),
      ).toMatchObject(denied);
      expect(
        await senderActions.setSenderDisabledAction(t.slug, { id: "a".repeat(24), disabled: true }),
      ).toMatchObject(denied);
      expect(await senderActions.deleteSenderAction(t.slug, { id: "a".repeat(24) })).toMatchObject(
        denied,
      );
    }

    t.as("developer");
    const created = await senderActions.createSenderAction(t.slug, {
      ...input,
      displayName: "Hello",
    });
    expect(created).toMatchObject({
      ok: true,
      data: { address: `hello@${t.domainName}`, isDefault: true },
    });
    if (!created.ok) return;

    const updated = await senderActions.updateSenderAction(t.slug, {
      id: created.data.id,
      version: created.data.version,
      displayName: "Hello there",
    });
    expect(updated).toMatchObject({ ok: true, data: { displayName: "Hello there" } });

    const disabled = await senderActions.setSenderDisabledAction(t.slug, {
      id: created.data.id,
      disabled: true,
    });
    expect(disabled).toMatchObject({ ok: true, data: { status: "disabled" } });
    const enabled = await senderActions.setSenderDisabledAction(t.slug, {
      id: created.data.id,
      disabled: false,
    });
    expect(enabled).toMatchObject({ ok: true, data: { status: "active" } });

    // A stale version is a conflict, not a silent overwrite.
    const stale = await senderActions.updateSenderAction(t.slug, {
      id: created.data.id,
      version: created.data.version,
      displayName: "Stale",
    });
    expect(stale).toMatchObject({ ok: false, error: { code: "conflict" } });

    expect(await senderActions.deleteSenderAction(t.slug, { id: created.data.id })).toMatchObject({
      ok: true,
    });
    const gone = await m.models.SenderModel.findById(created.data.id);
    expect(gone?.deletedAt).toBeTruthy();
  });

  it("reports duplicate addresses and unverified domains in plain fields", async () => {
    const t = await setup();
    t.as("admin");
    const input = { domainId: t.domain._id.toHexString(), localPart: "dup" };
    expect(await senderActions.createSenderAction(t.slug, input)).toMatchObject({ ok: true });
    expect(await senderActions.createSenderAction(t.slug, input)).toMatchObject({
      ok: false,
      error: { code: "conflict", fieldErrors: { localPart: [expect.any(String)] } },
    });
    await m.models.DomainModel.updateOne({ _id: t.domain._id }, { status: "pending" });
    expect(
      await senderActions.createSenderAction(t.slug, { ...input, localPart: "other" }),
    ).toMatchObject({ ok: false, error: { code: "domain_unverified" } });
  });
});

describe("compose actions: draft, send, schedule, cancel", () => {
  it("runs the whole flow as a Support member", async () => {
    const t = await setup();
    t.as("admin");
    const sender = await senderActions.createSenderAction(t.slug, {
      domainId: t.domain._id.toHexString(),
      localPart: "support",
    });
    if (!sender.ok) throw new Error("sender");

    t.as("support");
    const saved = await compose.saveDraftAction(t.slug, {
      senderId: sender.data.id,
      to: ["jane@customer.test"],
      subject: "Hello",
      mode: "rich",
      bodyHtml: "<p>Hi</p>",
    });
    expect(saved).toMatchObject({ ok: true, data: { version: 0 } });
    if (!saved.ok) return;

    const next = await compose.saveDraftAction(t.slug, {
      id: saved.data.id,
      version: saved.data.version,
      subject: "Hello again",
    });
    expect(next).toMatchObject({ ok: true, data: { subject: "Hello again" } });
    expect(
      await compose.saveDraftAction(t.slug, {
        id: saved.data.id,
        version: saved.data.version, // stale
        subject: "Lost update",
      }),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });

    // Another member cannot read or delete it.
    t.as("developer");
    expect(await compose.getDraftAction(t.slug, { id: saved.data.id })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });

    t.as("support");
    const sent = await compose.sendEmailAction(t.slug, {
      senderId: sender.data.id,
      to: ["jane@customer.test"],
      subject: "Hello again",
      html: "<p>Hi</p>",
      draftId: saved.data.id,
    });
    expect(sent).toMatchObject({ ok: true, data: { status: "sent" } });
    expect(await m.models.DraftModel.countDocuments({ _id: saved.data.id })).toBe(0);
    if (!sent.ok) return;
    const email = await m.models.EmailModel.findById(sent.data.emailId);
    expect(email).toMatchObject({ status: "queued", direction: "outbound" });
    expect(email?.to[0]?.address).toBe("jane@customer.test");

    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const scheduled = await compose.sendEmailAction(t.slug, {
      senderId: sender.data.id,
      to: ["jane@customer.test"],
      subject: "Later",
      html: "<p>Later</p>",
      scheduledAt: later,
    });
    expect(scheduled).toMatchObject({ ok: true, data: { status: "scheduled" } });
    if (!scheduled.ok) return;
    expect(
      await compose.cancelScheduledAction(t.slug, { emailId: scheduled.data.emailId }),
    ).toMatchObject({ ok: true, data: { status: "canceled" } });
    expect((await m.models.EmailModel.findById(scheduled.data.emailId))?.status).toBe("canceled");

    // Past times and empty bodies are validation errors with per-field messages.
    expect(
      await compose.sendEmailAction(t.slug, {
        senderId: sender.data.id,
        to: ["jane@customer.test"],
        subject: "Now",
        html: "",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "validation", fieldErrors: { html: [expect.any(String)] } },
    });
  });

  it("reports a disabled sender as sender_inactive", async () => {
    const t = await setup();
    t.as("owner");
    const sender = await senderActions.createSenderAction(t.slug, {
      domainId: t.domain._id.toHexString(),
      localPart: "off",
    });
    if (!sender.ok) throw new Error("sender");
    await senderActions.setSenderDisabledAction(t.slug, { id: sender.data.id, disabled: true });
    expect(
      await compose.sendEmailAction(t.slug, {
        senderId: sender.data.id,
        to: ["a@b.co"],
        subject: "x",
        html: "<p>x</p>",
      }),
    ).toMatchObject({ ok: false, error: { code: "sender_inactive" } });
  });
});
