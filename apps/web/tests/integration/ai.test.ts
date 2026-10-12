import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startTestDb } from "./helpers";
import { addRollup, seedTeam } from "./alerts-helpers";
import { ctxFor, loadMail, seedOrg, storeEvent, type Mail, type Seed } from "./mail-helpers";

let stop: () => Promise<void>;
let m: Mail;
let credits: typeof import("@/lib/ai/credits");
let access: typeof import("@/lib/ai/access");
let client: typeof import("@/lib/ai/client");
let triage: typeof import("@/lib/services/ai-triage");
let draft: typeof import("@/lib/services/ai-draft");
let compose: typeof import("@/lib/services/ai-compose");
let anomaly: typeof import("@/lib/services/ai-anomaly");
let settings: typeof import("@/lib/services/ai-settings");
let fake: InstanceType<(typeof import("@/lib/ai/client"))["FakeAiClient"]>;

beforeAll(async () => {
  ({ stop } = await startTestDb("ai"));
  m = await loadMail();
  credits = await import("@/lib/ai/credits");
  access = await import("@/lib/ai/access");
  client = await import("@/lib/ai/client");
  triage = await import("@/lib/services/ai-triage");
  draft = await import("@/lib/services/ai-draft");
  compose = await import("@/lib/services/ai-compose");
  anomaly = await import("@/lib/services/ai-anomaly");
  settings = await import("@/lib/services/ai-settings");
}, 120_000);

afterAll(async () => {
  client?.setAiClient(null);
  await m?.connect.disconnectDb();
  await stop?.();
});

beforeEach(() => {
  m.fake.resetFakeResend();
  m.jobs.resetSentJobs();
  fake = new client.FakeAiClient();
  client.setAiClient(fake);
});

const balance = async (orgId: Types.ObjectId) =>
  (await m.models.OrgSettingsModel.findOne({ orgId }).lean())!.aiCredits!;
const usage = (orgId: Types.ObjectId, filter: Record<string, unknown> = {}) =>
  m.models.AiUsageModel.find({ orgId, ...filter })
    .sort({ createdAt: 1 })
    .lean();

async function setup(plan: "free" | "pro" = "pro", overrides?: Record<string, unknown>) {
  const seed = await seedOrg(m, { plan });
  if (overrides) {
    await m.models.OrgSettingsModel.updateOne({ orgId: seed.orgId }, { $set: overrides });
  }
  const team = await seedTeam(m, seed);
  return { seed, team };
}

const allowance = (n: number) => ({ "limitOverrides.aiCreditsPerMonth": n });

/** email.received -> process-event -> fetch-inbound, as the jobs run it. */
async function receive(
  seed: Seed,
  input: Parameters<Mail["fake"]["createFakeReceivedEmail"]>[1],
  at = new Date(),
) {
  const inbound = m.fake.createFakeReceivedEmail(seed.key, input);
  const eventId = await storeEvent(m, seed, "email.received", inbound.event as never, at);
  const processed = await m.processing.processWebhookEvent(eventId);
  const fetched = await m.inbound.fetchInboundEmail({
    emailId: processed.fetchInbound!.emailId,
    orgId: processed.fetchInbound!.orgId,
  });
  const email = await m.models.EmailModel.findById(processed.emailId);
  return { fetched, emailId: email!._id, threadId: email!.threadId! };
}

describe("credits: reserve, commit, release", () => {
  it("follows the plan allowance and settles a reservation into ai_usage", async () => {
    const { seed } = await setup();
    const orgId = seed.orgId;
    const reservation = await credits.reserveCredits(orgId, 5);
    let c = await balance(orgId);
    expect(c).toMatchObject({ periodAllowance: 1000, reserved: 5, periodUsed: 0 }); // Pro
    expect(c.periodStart).toBeInstanceOf(Date);

    const settled = await credits.commitCredits(reservation, {
      userId: null,
      feature: "draft",
      model: "fake-main",
      promptTokens: 10,
      completionTokens: 20,
    });
    expect(settled).toEqual({ fromAllowance: 5, fromPack: 0 });
    c = await balance(orgId);
    expect(c).toMatchObject({ reserved: 0, periodUsed: 5 });
    const rows = await usage(orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      feature: "draft",
      credits: 5,
      model: "fake-main",
      promptTokens: 10,
      completionTokens: 20,
      creditsFrom: { allowance: 5, pack: 0 },
    });
  });

  it("release gives the hold back and writes nothing", async () => {
    const { seed } = await setup();
    const reservation = await credits.reserveCredits(seed.orgId, 5);
    await credits.releaseCredits(reservation);
    expect(await balance(seed.orgId)).toMatchObject({ reserved: 0, periodUsed: 0 });
    expect(await usage(seed.orgId)).toHaveLength(0);
    // Releasing twice never goes negative.
    await credits.releaseCredits(reservation);
    expect((await balance(seed.orgId)).reserved).toBe(0);
  });

  it("refuses with a typed, friendly error when the balance cannot cover it", async () => {
    const { seed } = await setup("pro", allowance(3));
    const error = await credits.reserveCredits(seed.orgId, 5).catch((e) => e);
    expect(error).toMatchObject({ code: "ai_credits_exhausted" });
    expect(error.message).toMatch(/used all its AI credits/);
    expect((await balance(seed.orgId)).reserved).toBe(0);
  });

  it("uses the allowance first, then packs; expired packs do not count", async () => {
    const { seed } = await setup("pro", allowance(3));
    await m.models.OrgSettingsModel.updateOne(
      { orgId: seed.orgId },
      { $set: { "aiCredits.packBalance": 10 } },
    );
    const r = await credits.reserveCredits(seed.orgId, 5);
    const settled = await credits.commitCredits(r, {
      userId: null,
      feature: "anomaly",
      model: "x",
      promptTokens: 1,
      completionTokens: 1,
    });
    expect(settled).toEqual({ fromAllowance: 3, fromPack: 2 });
    expect(await balance(seed.orgId)).toMatchObject({ periodUsed: 3, packBalance: 8, reserved: 0 });
    const [row] = await usage(seed.orgId);
    expect(row!.creditsFrom).toMatchObject({ allowance: 3, pack: 2 });

    await m.models.OrgSettingsModel.updateOne(
      { orgId: seed.orgId },
      { $set: { "aiCredits.packExpiresAt": new Date(Date.now() - 1000) } },
    );
    await expect(credits.reserveCredits(seed.orgId, 1)).rejects.toMatchObject({
      code: "ai_credits_exhausted",
    });
    expect((await credits.getAiBalance(seed.orgId)).packs).toBe(0);
  });

  it("concurrent reservations can never spend the same credit twice", async () => {
    const { seed } = await setup("pro", allowance(10));
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => credits.reserveCredits(seed.orgId, 2)),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(5);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(7);
    expect((await balance(seed.orgId)).reserved).toBe(10);

    // Settling all of them concurrently leaves exactly the allowance used.
    const held = results
      .filter(
        (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof credits.reserveCredits>>> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);
    await Promise.all(
      held.map((h) =>
        credits.commitCredits(h, {
          userId: null,
          feature: "compose",
          model: "x",
          promptTokens: 1,
          completionTokens: 1,
        }),
      ),
    );
    expect(await balance(seed.orgId)).toMatchObject({ periodUsed: 10, reserved: 0 });
    expect(await usage(seed.orgId)).toHaveLength(5);
  });

  it("resets usage in a new period and follows plan changes", async () => {
    const { seed } = await setup();
    await credits.getAiBalance(seed.orgId);
    await m.models.OrgSettingsModel.updateOne(
      { orgId: seed.orgId },
      { $set: { "aiCredits.periodUsed": 400, "aiCredits.periodStart": new Date("2020-01-01") } },
    );
    const b = await credits.getAiBalance(seed.orgId);
    expect(b).toMatchObject({ used: 0, allowance: 1000, available: 1000 });

    await m.models.OrgSettingsModel.updateOne({ orgId: seed.orgId }, { $set: { plan: "team" } });
    expect((await credits.getAiBalance(seed.orgId)).allowance).toBe(5000);
  });

  it("caps the trial at 200 credits", async () => {
    const { seed } = await setup("pro", {
      planState: "trialing",
      trial: { startedAt: new Date(), endsAt: new Date(Date.now() + 5 * 86_400_000) },
    });
    expect((await credits.getAiBalance(seed.orgId)).allowance).toBe(200);
  });
});

describe("plan gate and org opt-out", () => {
  it("Free: every feature answers ai_not_in_plan, nothing reaches the model or the balance", async () => {
    const { seed, team } = await setup("free");
    const ctx = ctxFor(m, seed.orgId, "owner", { userId: team.people.owner!.userId });
    await expect(
      compose.composeAssist(ctx, { action: "subjects", subject: "Hi", bodyHtml: "<p>Body</p>" }),
    ).rejects.toMatchObject({ code: "ai_not_in_plan" });
    await expect(
      compose.composeAssist(ctx, { action: "shorten", bodyHtml: "<p>Body</p>" }),
    ).rejects.toMatchObject({ code: "ai_not_in_plan" });
    expect(fake.calls).toHaveLength(0);
    expect(await usage(seed.orgId)).toHaveLength(0);
    expect(await access.aiAllowed(seed.orgId, "triage")).toBe(false);
    const status = await settings.getAiStatus(ctx);
    expect(status).toMatchObject({ planIncluded: false, planLabel: "Free", canConfigure: true });
  });

  it("Free: an inbound message enqueues no triage job", async () => {
    const seed = await seedOrg(m, { plan: "free" });
    await receive(seed, {
      from: "Jane <jane@customer.test>",
      to: [seed.mailbox],
      subject: "Hi",
      text: "Help me",
    });
    expect(m.jobs.sentJobs.filter((j) => j.name === "ai/triage.requested")).toHaveLength(0);
  });

  it("an Admin can switch AI or a feature off; the change is audited and takes effect at once", async () => {
    const { seed, team } = await setup();
    const admin = ctxFor(m, seed.orgId, "admin", { userId: team.people.admin!.userId });
    const all = { triage: true, drafts: true, compose: true, anomalies: true };

    await settings.updateAiSettings(admin, { enabled: true, features: { ...all, compose: false } });
    await expect(
      compose.composeAssist(admin, { action: "shorten", bodyHtml: "<p>Body</p>" }),
    ).rejects.toMatchObject({ code: "ai_feature_disabled" });
    await expect(access.assertAiAccess(seed.orgId, "triage")).resolves.toBeTruthy();

    await settings.updateAiSettings(admin, { enabled: false, features: all });
    await expect(access.assertAiAccess(seed.orgId, "triage")).rejects.toMatchObject({
      code: "ai_disabled",
    });
    expect(await access.aiAllowed(seed.orgId, "triage")).toBe(false);
    expect(fake.calls).toHaveLength(0);

    const audit = await m.models.AuditLogModel.find({
      orgId: seed.orgId,
      action: "ai.settings_updated",
    }).sort({ _id: 1 });
    expect(audit).toHaveLength(2);
    expect(audit[1]!.changes).toMatchObject({
      before: { enabled: true },
      after: { enabled: false },
    });

    await settings.updateAiSettings(admin, { enabled: true, features: all });
    await expect(
      compose.composeAssist(admin, { action: "shorten", bodyHtml: "<p>Body</p>" }),
    ).resolves.toMatchObject({ kind: "text" });
  });

  it("AI is on by default for a paid org (opt-out model)", async () => {
    const { seed } = await setup();
    expect(await access.getAiSwitches(seed.orgId)).toEqual({
      enabled: true,
      features: { triage: true, drafts: true, compose: true, anomalies: true },
    });
  });
});

describe("who can use AI (role matrix)", () => {
  it("ai:use for Owner, Admin, Developer and Support; not Viewer; configure for Owner and Admin", async () => {
    const { seed, team } = await setup();
    const as = (role: "owner" | "admin" | "developer" | "support" | "viewer") =>
      ctxFor(m, seed.orgId, role, { userId: team.people[role]!.userId });
    const input = { action: "shorten" as const, bodyHtml: "<p>Hello there. Long text.</p>" };

    for (const role of ["owner", "admin", "developer", "support"] as const) {
      await expect(compose.composeAssist(as(role), input)).resolves.toMatchObject({ kind: "text" });
    }
    await expect(compose.composeAssist(as("viewer"), input)).rejects.toMatchObject({
      code: "forbidden",
    });

    const all = { triage: true, drafts: true, compose: true, anomalies: true };
    for (const role of ["owner", "admin"] as const) {
      await expect(
        settings.updateAiSettings(as(role), { enabled: true, features: all }),
      ).resolves.toBeTruthy();
    }
    for (const role of ["developer", "support", "viewer"] as const) {
      await expect(
        settings.updateAiSettings(as(role), { enabled: false, features: all }),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(settings.getAiUsage(as(role))).rejects.toMatchObject({ code: "forbidden" });
    }
    expect((await settings.getAiStatus(as("viewer"))).canUse).toBe(false);
    expect((await settings.getAiStatus(as("support"))).canUse).toBe(true);
    // Usage rows name the member who used AI.
    const usageView = await settings.getAiUsage(as("owner"));
    expect(usageView.byFeature.compose.calls).toBe(4);
    expect(usageView.rows[0]!.member).toBeTruthy();
  });
});

describe("triage", () => {
  it("is enqueued after fetch-inbound, stores the result on the email and thread, filters the inbox", async () => {
    const { seed, team } = await setup();
    const ctx = ctxFor(m, seed.orgId, "owner", { userId: team.people.owner!.userId });
    const { emailId, threadId } = await receive(seed, {
      from: "Jane Doe <jane@customer.test>",
      to: [seed.mailbox],
      subject: "Invoice question",
      text: "I was charged twice, please refund the invoice.\n\n-- \nJane\n+1 555 0100\n\nOn Mon, Bob wrote:\n> secret quoted history",
    });
    const jobs = m.jobs.sentJobs.filter((j) => j.name === "ai/triage.requested");
    expect(jobs).toEqual([
      {
        name: "ai/triage.requested",
        data: { emailId: emailId.toHexString(), orgId: seed.orgId.toHexString() },
      },
    ]);

    const outcome = await triage.triageEmail(jobs[0]!.data);
    expect(outcome).toMatchObject({ status: "done", triage: { category: "billing" } });

    // Minimized prompt: quoted history and signature never left.
    expect(fake.calls[0]!.user).toContain("refund the invoice");
    expect(fake.calls[0]!.user).not.toMatch(/secret quoted|555 0100/);
    expect(fake.calls[0]!.tier).toBe("fast");

    const content = await m.models.EmailContentModel.findOne({ emailId });
    expect(content!.aiSummary).toMatchObject({ category: "billing", model: "fake-fast" });
    const thread = await m.models.ThreadModel.findById(threadId);
    expect(thread).toMatchObject({ aiCategory: "billing", aiTriage: { category: "billing" } });

    const list = await m.emails.listThreads(ctx, { folder: "inbox" });
    expect(list.items[0]!.ai).toMatchObject({ category: "billing", sentiment: "neutral" });
    expect((await m.emails.getThread(ctx, threadId.toHexString())).ai?.category).toBe("billing");
    expect(
      (await m.emails.listThreads(ctx, { folder: "inbox", category: "billing" })).items,
    ).toHaveLength(1);
    expect(
      (await m.emails.listThreads(ctx, { folder: "inbox", category: "sales" })).items,
    ).toHaveLength(0);

    const rows = await usage(seed.orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feature: "triage", credits: 1, userId: null });
    expect(rows[0]!.refs).toMatchObject({ emailId, threadId });
  });

  it("never charges twice for the same email (job retry) and reports quiet skips", async () => {
    const { seed } = await setup();
    const { emailId } = await receive(seed, {
      from: "Sam <sam@customer.test>",
      to: [seed.mailbox],
      subject: "Pricing",
      text: "Can I get a demo and a quote?",
    });
    const data = { emailId: emailId.toHexString(), orgId: seed.orgId.toHexString() };
    expect(await triage.triageEmail(data)).toMatchObject({
      status: "done",
      triage: { category: "sales" },
    });
    expect(await triage.triageEmail(data)).toEqual({ status: "skipped", reason: "already_done" });
    expect(await usage(seed.orgId)).toHaveLength(1);
    expect(
      await triage.triageEmail({ ...data, emailId: new Types.ObjectId().toHexString() }),
    ).toEqual({
      status: "skipped",
      reason: "not_found",
    });
  });

  it("skips (no retry) when credits ran out or AI was switched off after enqueueing", async () => {
    const { seed } = await setup("pro", allowance(0));
    const { emailId } = await receive(seed, {
      from: "Sam <sam@customer.test>",
      to: [seed.mailbox],
      subject: "Hello",
      text: "Just saying hi",
    });
    const data = { emailId: emailId.toHexString(), orgId: seed.orgId.toHexString() };
    expect(await triage.triageEmail(data)).toEqual({
      status: "skipped",
      reason: "ai_credits_exhausted",
    });
    await m.models.OrgSettingsModel.updateOne(
      { orgId: seed.orgId },
      { $set: { "ai.enabled": false } },
    );
    expect(await triage.triageEmail(data)).toEqual({ status: "skipped", reason: "ai_disabled" });
    expect(fake.calls).toHaveLength(0);
  });

  it("a provider failure throws for the job retry and releases the credits", async () => {
    const { seed } = await setup();
    const { emailId } = await receive(seed, {
      from: "Sam <sam@customer.test>",
      to: [seed.mailbox],
      subject: "Broken",
      text: "[[ai-fail]] please help",
    });
    await expect(
      triage.triageEmail({ emailId: emailId.toHexString(), orgId: seed.orgId.toHexString() }),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
    expect(await balance(seed.orgId)).toMatchObject({ reserved: 0, periodUsed: 0 });
    expect(await usage(seed.orgId)).toHaveLength(0);
  });

  it("only the newest inbound message speaks for the thread", async () => {
    const { seed } = await setup();
    const first = await receive(
      seed,
      {
        from: "Jane <jane@customer.test>",
        to: [seed.mailbox],
        subject: "Project",
        text: "Thanks, all good here.",
      },
      new Date(Date.now() - 60_000),
    );
    const second = await receive(seed, {
      from: "Jane <jane@customer.test>",
      to: [seed.mailbox],
      subject: "Re: Project",
      text: "Urgent: the site is down, help!",
      inReplyTo: undefined,
    } as never);
    expect(second.threadId.equals(first.threadId)).toBe(true);
    const org = seed.orgId.toHexString();
    await triage.triageEmail({ emailId: second.emailId.toHexString(), orgId: org });
    // The older message finishes later and must not overwrite the newer result.
    await triage.triageEmail({ emailId: first.emailId.toHexString(), orgId: org });
    const thread = await m.models.ThreadModel.findById(first.threadId);
    expect(thread!.aiTriage).toMatchObject({ priority: "urgent" });
    expect(thread!.aiTriage!.emailId!.equals(second.emailId)).toBe(true);
  });
});

describe("reply drafts", () => {
  it("drafts from thread context, saves and sends nothing, meters 5 credits", async () => {
    const { seed, team } = await setup();
    const ctx = ctxFor(m, seed.orgId, "support", { userId: team.people.support!.userId });
    const { threadId } = await receive(seed, {
      from: "Jane Doe <jane@customer.test>",
      to: [seed.mailbox],
      subject: "Login problem",
      text: "I can't log in since yesterday.\n\nOn Sun, Support wrote:\n> Did you reset?",
    });
    const emailsBefore = await m.models.EmailModel.countDocuments({ orgId: seed.orgId });
    const result = await draft.draftReply(ctx, {
      threadId: threadId.toHexString(),
      tone: "empathetic",
    });
    expect(result.html).toMatch(/^<p>Hi Jane,<\/p>/);
    expect(result.html).toContain("sorry");
    expect(result.text).toContain("Hi Jane,");
    expect(fake.calls[0]!.feature).toBe("draft");
    expect(fake.calls[0]!.user).toContain("I can't log in");
    expect(fake.calls[0]!.user).not.toContain("Did you reset");
    expect(fake.calls[0]!.tier).toBe("main");

    expect(await m.models.EmailModel.countDocuments({ orgId: seed.orgId })).toBe(emailsBefore);
    expect(await m.models.DraftModel.countDocuments({ orgId: seed.orgId })).toBe(0);
    const [row] = await usage(seed.orgId, { feature: "draft" });
    expect(row).toMatchObject({ credits: 5, userId: new Types.ObjectId(ctx.user.id) });
  });

  it("respects project scope and roles", async () => {
    const projectId = new Types.ObjectId();
    const seed = await seedOrg(m, { plan: "pro", projectId });
    const { threadId } = await receive(seed, {
      from: "Jane <jane@customer.test>",
      to: [seed.mailbox],
      subject: "Scoped",
      text: "Question about my plan",
    });
    const outsider = ctxFor(m, seed.orgId, "support", {
      projectScope: [new Types.ObjectId().toHexString()],
    });
    await expect(
      draft.draftReply(outsider, { threadId: threadId.toHexString(), tone: "friendly" }),
    ).rejects.toMatchObject({ code: "not_found" });
    const viewer = ctxFor(m, seed.orgId, "viewer");
    await expect(
      draft.draftReply(viewer, { threadId: threadId.toHexString(), tone: "friendly" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(fake.calls).toHaveLength(0);
  });

  it("needs an inbound message to answer", async () => {
    const seed = await seedOrg(m, { plan: "pro" });
    const thread = await m.models.ThreadModel.create({
      orgId: seed.orgId,
      connectionId: seed.connectionId,
      subject: "Empty",
      lastMessageAt: new Date(),
    });
    const ctx = ctxFor(m, seed.orgId, "owner");
    await expect(
      draft.draftReply(ctx, { threadId: thread._id.toHexString(), tone: "friendly" }),
    ).rejects.toMatchObject({ code: "ai_no_content" });
  });
});

describe("compose helpers", () => {
  it("subjects, rewrite in a tone, shorten and fix grammar are suggestions with per-action cost", async () => {
    const { seed } = await setup();
    const ctx = ctxFor(m, seed.orgId, "developer");
    const bodyHtml =
      "<p>i dont recieve teh invoice. Can you check it please</p><p>Also the second one is missing entirely.</p>";

    const subjects = await compose.composeAssist(ctx, {
      action: "subjects",
      subject: "Invoice",
      bodyHtml,
    });
    expect(subjects).toMatchObject({ kind: "subjects" });
    expect(subjects.kind === "subjects" && subjects.suggestions.length).toBeGreaterThanOrEqual(3);

    const rewrite = await compose.composeAssist(ctx, {
      action: "rewrite",
      tone: "professional",
      bodyHtml,
    });
    expect(rewrite.kind === "text" && rewrite.text).toMatch(/^Thank you for your time\./);
    const grammar = await compose.composeAssist(ctx, { action: "grammar", bodyHtml });
    expect(grammar.kind === "text" && grammar.text).toContain("I don't receive the invoice.");
    const shorter = await compose.composeAssist(ctx, { action: "shorten", bodyHtml });
    expect(shorter.kind === "text" && shorter.text.length).toBeLessThan(
      "i dont recieve teh invoice. Can you check it please Also the second one is missing entirely."
        .length,
    );

    const rows = await usage(seed.orgId, { feature: "compose" });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.credits === 2)).toBe(true);
    expect(fake.calls.every((c) => c.tier === "fast")).toBe(true);
    // Output is escaped HTML: a model cannot smuggle markup into the composer.
    expect(rewrite.kind === "text" && rewrite.html).toMatch(/^<p>/);
  });

  it("an empty draft is refused without spending credits; a failing model releases them", async () => {
    const { seed } = await setup();
    const ctx = ctxFor(m, seed.orgId, "owner");
    await expect(
      compose.composeAssist(ctx, { action: "rewrite", bodyHtml: "<p> </p>", tone: "friendly" }),
    ).rejects.toMatchObject({ code: "ai_no_content" });
    await expect(
      compose.composeAssist(ctx, { action: "subjects", subject: "", bodyHtml: "" }),
    ).rejects.toMatchObject({ code: "ai_no_content" });
    await expect(
      compose.composeAssist(ctx, { action: "grammar", bodyHtml: "<p>[[ai-fail]] text</p>" }),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
    expect(await balance(seed.orgId)).toMatchObject({ reserved: 0, periodUsed: 0 });
    expect(await usage(seed.orgId)).toHaveLength(0);
  });

  it("out of credits: the friendly error, no model call", async () => {
    const { seed } = await setup("pro", allowance(1));
    const ctx = ctxFor(m, seed.orgId, "owner");
    await expect(
      compose.composeAssist(ctx, { action: "shorten", bodyHtml: "<p>Some words here.</p>" }),
    ).rejects.toMatchObject({ code: "ai_credits_exhausted" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("incident explanation", () => {
  async function incident(seed: Seed, extra: Record<string, unknown> = {}) {
    return m.models.AlertIncidentModel.create({
      orgId: seed.orgId,
      ruleId: new Types.ObjectId(),
      dedupKey: `rule:${new Types.ObjectId()}`,
      title: "Bounce rate is 9%",
      ruleName: "Bounce rate over 3%",
      kind: "bounce_rate",
      openedAt: new Date(),
      observedValue: 9,
      context: {
        connectionId: seed.connectionId.toHexString(),
        domainId: seed.domain._id.toHexString(),
        domainName: seed.domain.name,
        threshold: 3,
        windowMinutes: 60,
        volume: 100,
      },
      ...extra,
    });
  }

  async function bounces(seed: Seed) {
    for (let i = 0; i < 4; i++) {
      await m.models.EmailModel.create({
        orgId: seed.orgId,
        connectionId: seed.connectionId,
        domainId: seed.domain._id,
        direction: "outbound",
        origin: "app",
        from: { address: seed.mailbox },
        to: [{ address: `user${i}@gmail.com` }],
        subject: "Secret subject",
        status: "bounced",
        bouncedAt: new Date(),
        bounce: { type: "hard", message: `550 <user${i}@gmail.com>: mailbox not found` },
      });
    }
  }

  it("explains from rollups and bounce data, caches per incident, refresh charges again", async () => {
    const { seed, team } = await setup();
    const ctx = ctxFor(m, seed.orgId, "admin", { userId: team.people.admin!.userId });
    await addRollup(m, seed, { sent: 100, delivered: 88, bounced_hard: 8, bounced_soft: 1 });
    await bounces(seed);
    const doc = await incident(seed);

    const first = await anomaly.explainIncident(ctx, doc._id.toHexString());
    expect(first.cached).toBe(false);
    expect(first.text).toMatch(/9 of 100 emails bounced/);
    expect(first.text).toMatch(/gmail\.com/);
    // Grounding data only: no subjects, no recipient addresses.
    expect(fake.calls[0]!.user).toContain("gmail.com");
    expect(fake.calls[0]!.user).not.toMatch(/Secret subject|user\d@gmail/);
    expect(fake.calls[0]!.user).toContain("[address]");

    const stored = await m.models.AlertIncidentModel.findById(doc._id);
    expect(stored!.aiExplanation).toMatchObject({ text: first.text, model: "fake-main" });
    expect((await alertsIncident(ctx, doc._id.toHexString()))!.aiExplanation?.text).toBe(
      first.text,
    );

    const again = await anomaly.explainIncident(ctx, doc._id.toHexString());
    expect(again).toMatchObject({ cached: true, text: first.text });
    expect(await usage(seed.orgId, { feature: "anomaly" })).toHaveLength(1);

    const refreshed = await anomaly.explainIncident(ctx, doc._id.toHexString(), { refresh: true });
    expect(refreshed.cached).toBe(false);
    const rows = await usage(seed.orgId, { feature: "anomaly" });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ credits: 5 });
    expect(rows[0]!.refs!.incidentId!.equals(doc._id)).toBe(true);
  });

  it("has nothing to say without delivery data, and needs both ai:use and alert access", async () => {
    const { seed, team } = await setup();
    const owner = ctxFor(m, seed.orgId, "owner", { userId: team.people.owner!.userId });
    const doc = await incident(seed);
    await expect(anomaly.explainIncident(owner, doc._id.toHexString())).rejects.toMatchObject({
      code: "ai_no_content",
    });
    expect(await usage(seed.orgId)).toHaveLength(0);

    await addRollup(m, seed, { sent: 50, bounced_hard: 5 });
    // Support has ai:use but no alert access; Viewer has neither.
    for (const role of ["support", "viewer"] as const) {
      await expect(
        anomaly.explainIncident(ctxFor(m, seed.orgId, role), doc._id.toHexString()),
      ).rejects.toMatchObject({ code: "forbidden" });
    }
    await expect(
      anomaly.explainIncident(owner, new Types.ObjectId().toHexString()),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("Free plan: gated", async () => {
    const { seed, team } = await setup("free");
    const owner = ctxFor(m, seed.orgId, "owner", { userId: team.people.owner!.userId });
    await addRollup(m, seed, { sent: 50, bounced_hard: 5 });
    const doc = await incident(seed);
    await expect(anomaly.explainIncident(owner, doc._id.toHexString())).rejects.toMatchObject({
      code: "ai_not_in_plan",
    });
  });
});

async function alertsIncident(ctx: ReturnType<typeof ctxFor>, id: string) {
  const alerts = await import("@/lib/services/alerts");
  return alerts.getIncident(ctx, id);
}
