import { z } from "zod";

import mongoose from "mongoose";

import { connectDb } from "@/lib/db/connect";
import { EmailModel } from "@/lib/db/models/emails";
import { OrgSettingsModel, PLANS } from "@/lib/db/models/org-settings";
import { e2eEnabled, e2eNotFound } from "@/lib/e2e/guard";
import { env } from "@/lib/env";
import { createFakeReceivedEmail } from "@/lib/resend/fake-adapter";
import { signWebhook } from "@/lib/resend/events";
import { readWebhookSigningSecret } from "@/lib/services/webhook-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Test-only seeding for Playwright (guarded by `e2eEnabled`). Both kinds go through the real
 * ingest route with a valid Svix signature, so everything after ingest is the production path.
 *
 * - `inbound`: creates a received email in the fake Resend team behind `apiKey` and posts the
 *   `email.received` event to the connection's ingest URL.
 * - `plan`: puts the org with `orgSlug` on a paid plan (limits and features are otherwise Free).
 * - `event`: posts an `email.*` receipt (delivered, opened, ...) for an email Wisemail sent,
 *   found by `orgSlug`-independent `subject` + `connectionId`.
 */
const body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("inbound"),
    connectionId: z.string(),
    apiKey: z.string().startsWith("re_"),
    from: z.string(),
    to: z.array(z.string()).min(1),
    subject: z.string(),
    text: z.string().default("Hello from the e2e suite."),
    inReplyTo: z.string().optional(),
  }),
  z.object({ kind: z.literal("plan"), orgSlug: z.string(), plan: z.enum(PLANS) }),
  z.object({
    kind: z.literal("event"),
    connectionId: z.string(),
    type: z.enum([
      "email.sent",
      "email.delivered",
      "email.opened",
      "email.clicked",
      "email.bounced",
      "email.complained",
    ]),
    subject: z.string(),
    /** Repeat the event this many times (distinct Svix ids), e.g. to trip an alert threshold. */
    count: z.number().int().min(1).max(50).default(1),
  }),
]);

async function post(connectionId: string, payload: unknown) {
  const secret = await readWebhookSigningSecret(connectionId);
  if (!secret) throw new Error("connection has no webhook secret");
  const raw = JSON.stringify(payload);
  const url = `${env.APP_URL.replace(/\/$/, "")}/api/ingest/resend/${connectionId}`;
  const res = await fetch(url, { method: "POST", body: raw, headers: signWebhook(secret, raw) });
  return { status: res.status, body: await res.text() };
}

export async function POST(request: Request) {
  if (!e2eEnabled()) return e2eNotFound();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const input = parsed.data;

  if (input.kind === "inbound") {
    const { resendId, event } = createFakeReceivedEmail(input.apiKey, {
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      inReplyTo: input.inReplyTo,
    });
    const result = await post(input.connectionId, {
      type: "email.received",
      created_at: new Date().toISOString(),
      data: event,
    });
    return Response.json({ resendId, ingest: result });
  }

  await connectDb();
  if (input.kind === "plan") {
    const org = await mongoose.connection
      .db!.collection("organization")
      .findOne({ slug: input.orgSlug });
    if (!org) return Response.json({ error: "org_not_found" }, { status: 404 });
    await OrgSettingsModel.updateOne(
      { orgId: org._id },
      { plan: input.plan, planState: input.plan === "free" ? "free" : "active" },
    );
    return Response.json({ ok: true });
  }

  const email = await EmailModel.findOne({
    connectionId: input.connectionId,
    subject: input.subject,
    resendId: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (!email?.resendId) return Response.json({ error: "email_not_found" }, { status: 404 });
  const now = new Date().toISOString();
  const results = [];
  for (let i = 0; i < input.count; i++) {
    results.push(
      await post(input.connectionId, {
        type: input.type,
        created_at: now,
        data: {
          email_id: email.resendId,
          created_at: now,
          from: email.from?.address ?? "test@example.com",
          to: (email.to ?? []).map((a: { address: string }) => a.address),
          subject: input.subject,
        },
      }),
    );
  }
  return Response.json({ resendId: email.resendId, ingest: results });
}
