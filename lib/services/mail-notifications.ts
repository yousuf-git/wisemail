import "server-only";

import mongoose, { Types, type ClientSession } from "mongoose";

import { ThreadModel } from "@/lib/db/models/threads";
import { createNotifications } from "./notifications";

/**
 * Notifications produced by the mail pipeline (PRD §5.6): inbound mail, opened replies, bounces,
 * complaints, domain status changes and connections that need attention. Called from inside
 * `process-event` / `fetch-inbound` with the caller's transaction, so a notification exists
 * exactly when the change that caused it committed. Fan-out (who, which channel) is in
 * `notifications.ts`; here we only decide the wording, link and audience.
 */

type Opts = { session?: ClientSession };

export async function orgSlugOf(orgId: Types.ObjectId, opts: Opts = {}): Promise<string> {
  const org = await mongoose.connection
    .collection("organization")
    .findOne({ _id: orgId }, { projection: { slug: 1 }, session: opts.session });
  return String(org?.slug ?? "");
}

const person = (a?: { address: string; name?: string | null } | null) =>
  a?.name?.trim() || a?.address || "Someone";

export async function notifyInboundReceived(
  input: {
    orgId: Types.ObjectId;
    emailId: Types.ObjectId;
    threadId: Types.ObjectId;
    projectId: Types.ObjectId | null;
    from: { address: string; name?: string | null };
    subject: string;
  },
  opts: Opts = {},
) {
  const slug = await orgSlugOf(input.orgId, opts);
  return createNotifications(
    {
      orgId: input.orgId,
      type: "inbound_received",
      title: `New email from ${person(input.from)}`,
      body: input.subject || "(no subject)",
      link: `/${slug}/inbox/${input.threadId}`,
      refs: { emailId: input.emailId, threadId: input.threadId },
      projectId: input.projectId,
      audience: { permission: "thread:read" },
      dedupKey: `email:${input.emailId}:inbound`,
    },
    opts,
  );
}

type EmailForNotice = {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  projectId?: Types.ObjectId | null;
  threadId?: Types.ObjectId | null;
  direction: string;
  authorId?: Types.ObjectId | null;
  subject: string;
  to: { address: string; name?: string | null }[];
  bounce?: { type: string; message?: string | null } | null;
  openCount: number;
  likelyAutomatedOpen: boolean;
};

/** Bounce, complaint and "opened your reply" notifications for one processed email event. */
export async function notifyForEmailEvent(type: string, email: EmailForNotice, opts: Opts = {}) {
  if (email.direction !== "outbound") return;
  const base = {
    orgId: email.orgId,
    projectId: email.projectId ?? null,
    refs: { emailId: email._id, threadId: email.threadId ?? null },
  };
  const recipient = person(email.to[0]);
  if (type === "email.bounced" || type === "email.complained") {
    const bounced = type === "email.bounced";
    const slug = await orgSlugOf(email.orgId, opts);
    await createNotifications(
      {
        ...base,
        type: bounced ? "bounce" : "complaint",
        title: bounced ? `Bounce: ${recipient}` : `Spam complaint from ${recipient}`,
        body: bounced
          ? [email.subject, email.bounce?.message].filter(Boolean).join(" · ")
          : email.subject,
        link: `/${slug}/activity/${email._id}`,
        audience: { permission: "activity:read" },
        dedupKey: `email:${email._id}:${bounced ? "bounced" : "complained"}`,
      },
      opts,
    );
    return;
  }
  // Only the first genuine open, and only for messages a member wrote (they hear about it).
  if (type === "email.opened" && email.openCount === 1 && !email.likelyAutomatedOpen) {
    const userIds = new Set<string>();
    if (email.authorId) userIds.add(String(email.authorId));
    if (email.threadId) {
      const thread = await ThreadModel.findOne(
        { _id: email.threadId, orgId: email.orgId },
        { assigneeId: 1 },
        { session: opts.session },
      ).lean();
      if (thread?.assigneeId) userIds.add(String(thread.assigneeId));
    }
    if (userIds.size === 0) return;
    const slug = await orgSlugOf(email.orgId, opts);
    await createNotifications(
      {
        ...base,
        type: "reply_opened",
        title: `${recipient} opened your email`,
        body: email.subject,
        link: email.threadId
          ? `/${slug}/inbox/${email.threadId}`
          : `/${slug}/activity/${email._id}`,
        audience: { userIds: [...userIds].map((i) => new Types.ObjectId(i)) },
        dedupKey: `email:${email._id}:opened`,
      },
      opts,
    );
  }
}

export async function notifyDomainChanged(
  input: {
    orgId: Types.ObjectId;
    connectionId: Types.ObjectId;
    domainId: Types.ObjectId;
    projectId: Types.ObjectId | null;
    name: string;
    status: string;
    dedupKey: string;
  },
  opts: Opts = {},
) {
  const slug = await orgSlugOf(input.orgId, opts);
  const failing = /fail/.test(input.status);
  return createNotifications(
    {
      orgId: input.orgId,
      type: "domain_changed",
      title: `${input.name} is now ${input.status.replace(/_/g, " ")}`,
      body: failing
        ? "Resend flagged a problem. Check the domain's DNS records so email keeps flowing."
        : "",
      link: input.status === "deleted" ? `/${slug}/domains` : `/${slug}/domains/${input.domainId}`,
      refs: { connectionId: input.connectionId, domainId: input.domainId },
      projectId: input.projectId,
      audience: { permission: "domain:update" },
      dedupKey: input.dedupKey,
    },
    opts,
  );
}

const ATTENTION_REASONS: Record<string, string> = {
  key_revoked: "Its Resend API key was revoked. Add a new key to bring it back.",
  webhook_slot_unavailable: "Resend has no free webhook slot. Free one up and retry.",
};

/** Owners and admins hear when a connection stops working (UCD, failure modes). */
export async function notifyConnectionAttention(
  input: {
    orgId: Types.ObjectId;
    connectionId: Types.ObjectId;
    name: string;
    reason?: string | null;
  },
  opts: Opts = {},
) {
  const slug = await orgSlugOf(input.orgId, opts);
  return createNotifications(
    {
      orgId: input.orgId,
      type: "connection_attention",
      title: `${input.name} needs attention`,
      body: (input.reason && ATTENTION_REASONS[input.reason]) || "Open the connection to fix it.",
      link: `/${slug}/settings/connections/${input.connectionId}`,
      refs: { connectionId: input.connectionId },
      audience: { permission: "connection:update" },
      dedupKey: `connection:${input.connectionId}:attention:${input.reason ?? "unknown"}:${new Date().toISOString().slice(0, 13)}`,
    },
    opts,
  );
}
