import { Types } from "mongoose";

/**
 * Shared seeding for the Phase 4 mail tests. Everything is imported dynamically because
 * `lib/env` must see MONGODB_URI (set by `startTestDb`) before it is first loaded.
 */
export async function loadMail() {
  const [
    models,
    connect,
    perms,
    envelope,
    hook,
    fake,
    jobs,
    events,
    sending,
    senders,
    drafts,
    inbound,
    processing,
    emails,
    threads,
    storage,
  ] = await Promise.all([
    import("@/lib/db/models"),
    import("@/lib/db/connect"),
    import("@/lib/auth/permissions"),
    import("@/lib/crypto/envelope"),
    import("@/lib/services/webhook-secret"),
    import("@/lib/resend/fake-adapter"),
    import("@/lib/jobs/send"),
    import("@/lib/resend/events"),
    import("@/lib/services/sending"),
    import("@/lib/services/senders"),
    import("@/lib/services/drafts"),
    import("@/lib/services/inbound"),
    import("@/lib/services/events-processing"),
    import("@/lib/services/emails"),
    import("@/lib/services/threads"),
    import("@/lib/storage"),
  ]);
  await connect.connectDb();
  await Promise.all(
    Object.values(models).map((m) => (m as { init?: () => Promise<unknown> }).init?.()),
  );
  return {
    models,
    connect,
    perms,
    envelope,
    hook,
    fake,
    jobs,
    events,
    sending,
    senders,
    drafts,
    inbound,
    processing,
    emails,
    threads,
    storage,
  };
}

export type Mail = Awaited<ReturnType<typeof loadMail>>;
type Role = import("@/lib/auth/permissions").Role;
type Permission = import("@/lib/auth/permissions").Permission;
type OrgContext = import("@/lib/dal").OrgContext;

let counter = 0;

export type Seed = Awaited<ReturnType<typeof seedOrg>>;

/**
 * An org with one active connection (fake Resend team `t<n>`), a verified receiving domain
 * `t<n>.example.com` (the fake team's first domain), and an active sender `support@`.
 */
export async function seedOrg(
  m: Mail,
  options: { plan?: "free" | "pro"; projectId?: Types.ObjectId | null } = {},
) {
  const n = ++counter;
  const team = `t${n}${Date.now().toString(36)}`;
  const orgId = new Types.ObjectId();
  const key = `re_${team}_full`;
  const connectionId = new Types.ObjectId();

  await m.models.OrgSettingsModel.create({ orgId, plan: options.plan ?? "pro" });
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
  const slug = team.replace(/[^a-z0-9]/g, "");
  const domain = await m.models.DomainModel.create({
    orgId,
    connectionId,
    resendId: `dom_${slug}_1`,
    name: `${slug}.example.com`,
    status: "verified",
    openTracking: true,
    clickTracking: true,
    projectId: options.projectId ?? null,
    receiving: { enabled: true, mxVerified: true },
  });
  const sender = await m.models.SenderModel.create({
    orgId,
    domainId: domain._id,
    localPart: "support",
    address: `support@${domain.name}`,
    displayName: "Support",
    isDefault: true,
    status: "active",
    canReceiveReplies: true,
  });
  return { orgId, key, team, connectionId, domain, sender, mailbox: `support@${domain.name}` };
}

export function ctxFor(
  m: Mail,
  orgId: Types.ObjectId,
  role: Role = "owner",
  options: { projectScope?: string[] | null; userId?: Types.ObjectId } = {},
): OrgContext {
  const userId = options.userId ?? new Types.ObjectId();
  return {
    user: { id: userId.toHexString(), name: role, email: `${role}@x.com`, image: null },
    org: { id: orgId.toHexString(), name: "Org", slug: "org" },
    role,
    orgs: [],
    memberId: new Types.ObjectId().toHexString(),
    projectScope: options.projectScope ?? null,
    can: (permission: Permission) => m.perms.roleHasPermission(role, permission),
  } as unknown as OrgContext;
}

let svix = 0;

/** Stores a webhook event as ingest would and returns its id. */
export async function storeEvent(
  m: Mail,
  seed: Pick<Seed, "orgId" | "connectionId">,
  type: string,
  data: Record<string, unknown>,
  at: Date = new Date(),
) {
  const doc = await m.models.WebhookEventModel.create({
    orgId: seed.orgId,
    connectionId: seed.connectionId,
    svixId: `msg_${++svix}_${Date.now()}`,
    type,
    occurredAt: at,
    resendObjectId: (data.email_id ?? data.id) as string,
    payload: data,
    processedAt: null,
    expireAt: new Date(Date.now() + 86_400_000),
  });
  return doc._id.toHexString();
}

export const emailData = (resendId: string, extra: Record<string, unknown> = {}) => ({
  email_id: resendId,
  created_at: new Date().toISOString(),
  from: "Support <support@example.com>",
  to: ["jane@customer.test"],
  subject: "Hello",
  ...extra,
});

export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
