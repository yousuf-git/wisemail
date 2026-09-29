import "server-only";

import { ZodError, type ZodType } from "zod";
import { Types } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { decryptSecret } from "@/lib/crypto/envelope";
import { connectDb } from "@/lib/db/connect";
import { parseId } from "@/lib/db/ids";
import { AttachmentModel } from "@/lib/db/models/attachments";
import { ConnectionModel } from "@/lib/db/models/connections";
import { DomainModel } from "@/lib/db/models/domains";
import { DraftModel } from "@/lib/db/models/drafts";
import { EmailContentModel } from "@/lib/db/models/email-contents";
import { EmailModel, type EmailDoc } from "@/lib/db/models/emails";
import { SenderModel } from "@/lib/db/models/senders";
import { withTransaction } from "@/lib/db/transaction";
import { env } from "@/lib/env";
import { enqueueSendEmail } from "@/lib/jobs/send";
import { formatAddress, uniqueAddresses } from "@/lib/mail/address";
import { htmlToText, makeSnippet, sanitizeEmailHtml } from "@/lib/mail/sanitize";
import { PENDING_STATUSES } from "@/lib/mail/status";
import { publish } from "@/lib/realtime/publish";
import type { ResendAdapter } from "@/lib/resend/adapter";
import { getResendAdapter } from "@/lib/resend/client-factory";
import { isResendError } from "@/lib/resend/errors";
import type { SendEmailInput as ResendSendInput } from "@/lib/resend/types";
import { getStore, storageKeys } from "@/lib/storage";
import { presignForSend } from "@/lib/storage/presign";
import { MAX_EMAIL_BYTES, sendEmailInput, type SendEmailInput } from "@/lib/validation/mail";
import { EMAIL_TAG } from "./events-processing";
import { ServiceError } from "./errors";
import { expireAtFrom, getMailSettings } from "./mail-settings";
import { externalAddresses, isDuplicateKey, ownDomainNames } from "./mail-shared";
import { canSeeProject, projectFilter } from "./project-scope";
import { markDomainRejected, recomputeSenderStatuses } from "./senders";
import { requestSync, shouldRunInline } from "./sync";
import { attachMessageToThread, recomputeThreadCache } from "./threads";
import { keyAad } from "./webhook-secret";
import { notifyConnectionAttention } from "./mail-notifications";

/**
 * Sending (TRD §2.5). `sendEmail` validates and authorizes, creates the `emails` document
 * (`queued`, or `scheduled`) in a transaction, then delivers it: inline when it is immediate and
 * has no attachments, otherwise through the Inngest `send-email` job (throttled per connection).
 * `deliverEmail` is the one place that talks to Resend; it is idempotent (Resend idempotency key
 * = the email id, and it does nothing once `resendId` is stored).
 */

export type SendDeps = {
  adapter?: ResendAdapter;
  enqueue?: typeof enqueueSendEmail;
  inngestDev?: boolean;
  nodeEnv?: string;
};

export type SendResult = {
  emailId: string;
  status: "queued" | "scheduled" | "sent" | "failed";
  /** How it was handed over: sent by this request, queued for the job, or run in-process (dev). */
  mode: "inline" | "job" | "dev_inline";
  threadId: string | null;
};

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);

function parseInput<T>(schema: ZodType<T>, raw: unknown): T {
  try {
    return schema.parse(raw);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues)
      (fieldErrors[issue.path.join(".") || "_"] ??= []).push(issue.message);
    throw new ServiceError("validation", "Some fields need another look.", fieldErrors);
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Sendability                                                                                 */
/* ------------------------------------------------------------------------------------------ */

type SendContext = {
  sender: NonNullable<Awaited<ReturnType<typeof loadSendContext>>>["sender"];
  domain: NonNullable<Awaited<ReturnType<typeof loadSendContext>>>["domain"];
  connection: NonNullable<Awaited<ReturnType<typeof loadSendContext>>>["connection"];
};

async function loadSendContext(orgId: Types.ObjectId, senderId: Types.ObjectId) {
  const sender = await SenderModel.findOne({ _id: senderId, orgId, deletedAt: null }).lean();
  if (!sender) return null;
  const domain = await DomainModel.findOne({ _id: sender.domainId, orgId }).lean();
  const connection = domain
    ? await ConnectionModel.findOne({ _id: domain.connectionId, orgId, deletedAt: null }).lean()
    : null;
  return { sender, domain, connection };
}

/** Sender `active`, domain `verified`, connection `active`; a typed error names the first failure. */
export function assertSendable(ctx: {
  sender: { status: string; statusReason?: string | null; address: string };
  domain: { status: string; name: string } | null;
  connection: { status: string } | null;
}) {
  if (ctx.sender.status !== "active") {
    throw new ServiceError(
      "sender_inactive",
      ctx.sender.status === "disabled"
        ? `${ctx.sender.address} is disabled. Pick another sender.`
        : `${ctx.sender.address} can't send right now${ctx.sender.statusReason ? ` (${ctx.sender.statusReason.replace(/_/g, " ")})` : ""}. Pick another sender.`,
    );
  }
  if (!ctx.domain || ctx.domain.status !== "verified") {
    throw new ServiceError(
      "domain_unverified",
      `${ctx.domain?.name ?? "This domain"} isn't verified in Resend, so it can't send.`,
    );
  }
  if (!ctx.connection || ctx.connection.status !== "active") {
    throw new ServiceError(
      "connection_inactive",
      "This Resend connection needs attention, so it can't send. Check Settings, then Connections.",
    );
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Send                                                                                        */
/* ------------------------------------------------------------------------------------------ */

const REFERENCES_LIMIT = 20;

export async function sendEmail(
  ctx: OrgContext,
  raw: SendEmailInput,
  deps: SendDeps = {},
): Promise<SendResult> {
  authorize(ctx, "email:send");
  const input = parseInput(sendEmailInput, raw);
  await connectDb();
  const orgId = orgOid(ctx);
  const userId = new Types.ObjectId(ctx.user.id);

  const loaded = await loadSendContext(orgId, new Types.ObjectId(input.senderId));
  if (!loaded || !canSeeProject(ctx, loaded.domain?.projectId?.toHexString() ?? null)) {
    throw new ServiceError("not_found", "We couldn't find that sender.");
  }
  assertSendable(loaded);
  const { sender, domain, connection } = loaded as unknown as {
    sender: SendContext["sender"];
    domain: NonNullable<SendContext["domain"]>;
    connection: NonNullable<SendContext["connection"]>;
  };

  // Attachments come from the draft (or are listed explicitly); they must be the caller's uploads.
  const attachmentIds = new Set(input.attachmentIds);
  if (input.draftId) {
    const draft = await DraftModel.findOne(
      { _id: input.draftId, orgId, userId },
      { attachmentIds: 1 },
    ).lean();
    if (!draft) throw new ServiceError("not_found", "Draft not found.");
    for (const id of draft.attachmentIds) attachmentIds.add(id.toHexString());
  }
  const attachments = attachmentIds.size
    ? await AttachmentModel.find({
        _id: { $in: [...attachmentIds].map((id) => new Types.ObjectId(id)) },
        orgId,
        uploadedBy: userId,
        emailId: null,
        uploadStatus: "stored",
      })
    : [];
  if (attachments.length !== attachmentIds.size) {
    throw new ServiceError(
      "not_found",
      "One of the attachments is no longer available. Attach it again.",
    );
  }
  if (attachments.reduce((sum, a) => sum + a.size, 0) > MAX_EMAIL_BYTES) {
    throw new ServiceError(
      "attachment_too_large",
      "An email can carry at most 40 MB of attachments.",
    );
  }

  // Replies: threading headers and thread.
  let threadId: Types.ObjectId | null = null;
  let inReplyTo: string | undefined;
  let references: string[] = [];
  if (input.inReplyToEmailId) {
    const parent = await EmailModel.findOne({
      _id: input.inReplyToEmailId,
      orgId,
      ...projectFilter(ctx),
    }).lean();
    if (!parent)
      throw new ServiceError("not_found", "The message you're replying to no longer exists.");
    threadId = parent.threadId ?? null;
    if (parent.messageId) {
      inReplyTo = parent.messageId;
      references = [...new Set([...(parent.references ?? []), parent.messageId])].slice(
        -REFERENCES_LIMIT,
      );
    }
  }

  const settings = await getMailSettings(orgId);
  const html = input.html?.trim() ? input.html : undefined;
  const text = input.text?.trim() ? input.text : html ? htmlToText(html) : undefined;
  const scheduledAt = input.scheduledAt ?? null;
  const emailId = new Types.ObjectId();
  const now = new Date();
  const own = await ownDomainNames(orgId);
  const toAddr = input.to.map((address) => ({ address }));
  const ccAddr = input.cc.map((address) => ({ address }));
  const bccAddr = input.bcc.map((address) => ({ address }));
  const replyToList = input.replyTo ?? sender.replyTo ?? [];

  const created = await withTransaction(async (session) => {
    const [email] = await EmailModel.create(
      [
        {
          _id: emailId,
          orgId,
          connectionId: connection._id,
          resendId: null,
          direction: "outbound",
          origin: "app",
          domainId: domain._id,
          projectId: domain.projectId ?? null,
          senderId: sender._id,
          threadId,
          authorId: userId,
          inReplyTo,
          references,
          from: {
            address: sender.address,
            ...(sender.displayName ? { name: sender.displayName } : {}),
          },
          to: toAddr,
          cc: ccAddr,
          bcc: bccAddr,
          replyTo: replyToList.map((address) => ({ address })),
          recipientAddresses: uniqueAddresses([toAddr, ccAddr, bccAddr]),
          subject: input.subject,
          snippet: makeSnippet(text),
          tags: [
            { name: "mw_org", value: orgId.toHexString() },
            ...(domain.projectId
              ? [{ name: "mw_project", value: domain.projectId.toHexString() }]
              : []),
            { name: EMAIL_TAG, value: emailId.toHexString() },
          ],
          hasAttachments: attachments.length > 0,
          status: scheduledAt ? "scheduled" : "queued",
          scheduledAt: scheduledAt ?? undefined,
          expireAt: expireAtFrom(now, settings.retentionDays),
        },
      ],
      { session },
    );
    await EmailContentModel.create(
      [
        {
          orgId,
          emailId,
          html: html ? sanitizeEmailHtml(html) : undefined,
          text,
          sourceHtml: html,
          sourceText: text,
          expireAt: expireAtFrom(now, settings.retentionDays),
        },
      ],
      { session },
    );
    if (attachments.length) {
      await AttachmentModel.updateMany(
        { _id: { $in: attachments.map((a) => a._id) }, orgId },
        { $set: { emailId } },
        { session },
      );
    }
    if (threadId) {
      const threaded = await attachMessageToThread(
        {
          orgId,
          connectionId: connection._id,
          domainId: domain._id,
          projectId: domain.projectId ?? null,
          direction: "outbound",
          mailboxAddress: sender.address,
          subject: input.subject,
          participants: externalAddresses([...input.to, ...input.cc, ...input.bcc], own),
          at: scheduledAt ?? now,
          snippet: makeSnippet(text),
          hasAttachments: attachments.length > 0,
          inReplyTo,
          references,
        },
        { session, threadId },
      );
      threadId = threaded.threadId;
    }
    if (input.draftId) {
      // Attachments now belong to the email; only the draft document goes.
      await DraftModel.deleteOne({ _id: input.draftId, orgId, userId }, { session });
    }
    await publish(
      {
        orgId,
        projectId: domain.projectId ?? null,
        topics: [
          "emails",
          `email:${emailId.toHexString()}`,
          ...(threadId ? ["threads", `thread:${threadId.toHexString()}`] : []),
        ],
        patch: { emailId: emailId.toHexString(), status: email!.status },
      },
      { session },
    );
    return email!;
  });

  const job = {
    emailId: emailId.toHexString(),
    orgId: orgId.toHexString(),
    connectionId: connection._id.toHexString(),
  };
  const result = (status: SendResult["status"], mode: SendResult["mode"]): SendResult => ({
    emailId: job.emailId,
    status,
    mode,
    threadId: threadId?.toHexString() ?? null,
  });

  const immediate = !scheduledAt && attachments.length === 0;
  if (immediate) {
    try {
      await deliverEmail(job.emailId, { adapter: deps.adapter });
      return result("sent", "inline");
    } catch (error) {
      // Rate limits and outages: keep it queued and let the job retry ("Sending shortly").
      if (error instanceof ServiceError) throw error;
      if (!isResendError(error)) throw error;
    }
  }

  const delivered = await (deps.enqueue ?? enqueueSendEmail)(job);
  if (
    shouldRunInline({
      delivered,
      inngestDev: deps.inngestDev ?? env.INNGEST_DEV,
      nodeEnv: deps.nodeEnv ?? env.NODE_ENV,
    })
  ) {
    void deliverEmail(job.emailId, { adapter: deps.adapter }).catch((error) => {
      if (!(error instanceof ServiceError)) console.error("[send] inline delivery failed", error);
    });
    return result(created.status as "queued" | "scheduled", "dev_inline");
  }
  return result(created.status as "queued" | "scheduled", "job");
}

/* ------------------------------------------------------------------------------------------ */
/* Delivery (the only place that calls Resend to send)                                         */
/* ------------------------------------------------------------------------------------------ */

async function markFailed(email: EmailDoc, code: string, message: string) {
  await EmailModel.updateOne(
    { _id: email._id, orgId: email.orgId, resendId: null, status: { $in: PENDING_STATUSES } },
    { $set: { status: "failed", sendError: { code, message } } },
  );
  if (email.threadId) await recomputeThreadCache(email.orgId, email.threadId);
  await publish({
    orgId: email.orgId,
    projectId: email.projectId ?? null,
    topics: [
      "emails",
      `email:${email._id.toHexString()}`,
      ...(email.threadId ? [`thread:${email.threadId.toHexString()}`] : []),
    ],
    patch: { emailId: email._id.toHexString(), status: "failed", sendError: { code, message } },
  });
}

export type DeliverOutcome =
  | { status: "sent"; resendId: string }
  | { status: "skipped"; reason: "not_found" | "already_sent" | "not_pending" };

/**
 * Hands one queued or scheduled email to Resend. Permanent failures are recorded on the email
 * and thrown as `ServiceError`; transient ones (`ResendError` rate limit or outage) are rethrown
 * for the caller's retry policy and leave the email queued.
 */
export async function deliverEmail(
  emailId: string,
  deps: { adapter?: ResendAdapter } = {},
): Promise<DeliverOutcome> {
  await connectDb();
  const id = parseId("emails", emailId);
  if (!id) return { status: "skipped", reason: "not_found" };
  const email = await EmailModel.findOne({ _id: id, direction: "outbound", origin: "app" });
  if (!email) return { status: "skipped", reason: "not_found" };
  if (email.resendId) return { status: "skipped", reason: "already_sent" };
  if (!PENDING_STATUSES.includes(email.status)) return { status: "skipped", reason: "not_pending" };

  const { orgId } = email;
  const loaded = email.senderId ? await loadSendContext(orgId, email.senderId) : null;
  if (!loaded) {
    await markFailed(email, "sender_missing", "The sender no longer exists.");
    throw new ServiceError("sender_inactive", "The sender no longer exists.");
  }
  try {
    assertSendable(loaded);
  } catch (error) {
    // Scheduled and queued sends re-check sendability when they fire (TRD §2.5).
    if (error instanceof ServiceError) await markFailed(email, error.code, error.message);
    throw error;
  }
  const { domain, connection } = loaded as unknown as {
    domain: NonNullable<SendContext["domain"]>;
    connection: NonNullable<SendContext["connection"]>;
  };

  const adapter =
    deps.adapter ??
    getResendAdapter(decryptSecret(connection.apiKey!, { aad: keyAad(connection._id) }));
  const contents = await EmailContentModel.findOne({ emailId: email._id, orgId }).lean();
  const settings = await getMailSettings(orgId);
  const store = getStore();

  // Attachments: draft upload -> outbound key, presigned GET as Resend's `path`.
  const attachmentDocs = await AttachmentModel.find({
    orgId,
    emailId: email._id,
    direction: "outbound",
  });
  const outboundAttachments: NonNullable<ResendSendInput["attachments"]> = [];
  const draftKeys: string[] = [];
  for (const doc of attachmentDocs) {
    const target = storageKeys.outboundAttachment(orgId, email._id, doc._id);
    if (doc.storageKey && doc.storageKey !== target) {
      await store.copy(doc.storageKey, target);
      draftKeys.push(doc.storageKey);
      doc.storageKey = target;
      doc.draftId = null;
      await doc.save();
    }
    outboundAttachments.push({
      filename: doc.filename,
      path: await presignForSend(doc.storageKey!, doc),
      contentType: doc.contentType,
    });
  }

  const headers: Record<string, string> = {};
  if (email.inReplyTo) headers["In-Reply-To"] = email.inReplyTo;
  if (email.references.length) headers.References = email.references.join(" ");

  const payload: ResendSendInput = {
    from: formatAddress(email.from),
    to: email.to.map((a) => a.address),
    ...(email.cc.length ? { cc: email.cc.map((a) => a.address) } : {}),
    ...(email.bcc.length ? { bcc: email.bcc.map((a) => a.address) } : {}),
    ...(email.replyTo.length ? { replyTo: email.replyTo.map((a) => a.address) } : {}),
    subject: email.subject,
    ...(contents?.sourceHtml ? { html: contents.sourceHtml } : {}),
    ...(contents?.sourceText || !contents?.sourceHtml ? { text: contents?.sourceText ?? "" } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    tags: email.tags.map((t) => ({ name: t.name!, value: t.value! })),
    ...(outboundAttachments.length ? { attachments: outboundAttachments } : {}),
    // Resend rejects a past `scheduled_at`; a schedule that lapsed while queued sends now.
    ...(email.scheduledAt && email.scheduledAt.getTime() > Date.now()
      ? { scheduledAt: email.scheduledAt.toISOString() }
      : {}),
  };

  let result;
  try {
    result = await adapter.sendEmail(payload, { idempotencyKey: email._id.toHexString() });
  } catch (error) {
    if (!isResendError(error)) throw error;
    switch (error.code) {
      case "resend_domain_rejected": {
        await markDomainRejected(orgId, domain._id);
        await markFailed(email, "domain_rejected", error.message);
        // Refresh our view of the account's domains; never let this mask the send error.
        await requestSync({
          connectionId: connection._id.toHexString(),
          orgId: orgId.toHexString(),
          trigger: "manual",
        }).catch((syncError) => console.error("[send] domain sync request failed", syncError));
        throw new ServiceError(
          "domain_unverified",
          `${domain.name} is no longer verified in Resend. The sender was marked unusable.`,
        );
      }
      case "resend_unauthorized": {
        const flipped = await ConnectionModel.updateOne(
          { _id: connection._id, orgId, status: "active" },
          { $set: { status: "needs_attention", statusReason: "key_revoked" } },
        );
        if (flipped.modifiedCount > 0) {
          await notifyConnectionAttention({
            orgId,
            connectionId: connection._id,
            name: connection.name,
            reason: "key_revoked",
          });
        }
        await recomputeSenderStatuses(orgId, { connectionId: connection._id });
        await markFailed(email, "connection_inactive", error.message);
        throw new ServiceError("connection_inactive", "Resend rejected this connection's API key.");
      }
      case "resend_validation":
      case "resend_forbidden":
      case "resend_not_found": {
        await markFailed(email, error.code, error.message);
        throw new ServiceError("resend_rejected", error.message);
      }
      default:
        throw error; // rate limit or outage: stay queued, retry
    }
  }

  await storeResendId(email, result.id, result.messageId);
  if (draftKeys.length) await store.delete(draftKeys).catch(() => undefined);
  await EmailContentModel.updateOne(
    { emailId: email._id, orgId },
    { $unset: { sourceHtml: 1, sourceText: 1 } },
  );
  if (settings.storageMode === "resend" && attachmentDocs.length) {
    // Free: outbound files exist only to be sent (TRD §2.13).
    await store.delete(attachmentDocs.flatMap((a) => (a.storageKey ? [a.storageKey] : [])));
    await AttachmentModel.updateMany(
      { _id: { $in: attachmentDocs.map((a) => a._id) }, orgId },
      { $set: { storageMode: "none", storageKey: null } },
    );
  }
  return { status: "sent", resendId: result.id };
}

/**
 * Stores Resend's id on our email. If an event beat us and created a stub with that id, the
 * stub's history is folded into our document instead (rare: events normally find us by tag).
 */
async function storeResendId(email: EmailDoc, resendId: string, messageId?: string) {
  const set = { resendId, ...(messageId ? { messageId } : {}) };
  try {
    await EmailModel.updateOne({ _id: email._id, orgId: email.orgId }, { $set: set });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const stub = await EmailModel.findOne({ connectionId: email.connectionId, resendId }).lean();
    if (stub && !stub._id.equals(email._id)) {
      await withTransaction(async (session) => {
        const { WebhookEventModel } = await import("@/lib/db/models/webhook-events");
        await EmailModel.deleteOne({ _id: stub._id }, { session });
        await WebhookEventModel.updateMany(
          { emailId: stub._id },
          { $set: { emailId: email._id } },
          { session },
        );
        await EmailModel.updateOne(
          { _id: email._id, orgId: email.orgId },
          {
            $set: {
              ...set,
              status: stub.status,
              sentAt: stub.sentAt ?? undefined,
              deliveredAt: stub.deliveredAt ?? undefined,
              openCount: stub.openCount,
              clickCount: stub.clickCount,
            },
          },
          { session },
        );
      });
    }
  }
  await publish({
    orgId: email.orgId,
    projectId: email.projectId ?? null,
    topics: ["emails", `email:${email._id.toHexString()}`],
    patch: { emailId: email._id.toHexString(), resendId: undefined, status: undefined },
  });
}

/** Marks an email failed after the job used every retry (Inngest `onFailure`). */
export async function markSendFailed(emailId: string, message: string) {
  await connectDb();
  const id = parseId("emails", emailId);
  if (!id) return;
  const email = await EmailModel.findOne({ _id: id, resendId: null });
  if (email && PENDING_STATUSES.includes(email.status))
    await markFailed(email, "send_failed", message);
}

/* ------------------------------------------------------------------------------------------ */
/* Scheduled emails: cancel and reschedule (UC-10)                                             */
/* ------------------------------------------------------------------------------------------ */

async function loadScheduled(ctx: OrgContext, emailId: string) {
  if (!Types.ObjectId.isValid(emailId)) throw new ServiceError("not_found", "Email not found.");
  const email = await EmailModel.findOne({
    _id: emailId,
    orgId: orgOid(ctx),
    direction: "outbound",
    origin: "app",
    ...projectFilter(ctx),
  });
  if (!email) throw new ServiceError("not_found", "Email not found.");
  if (!email.scheduledAt || !PENDING_STATUSES.includes(email.status)) {
    throw new ServiceError(
      "conflict",
      "This email is no longer scheduled. It may have been sent already.",
    );
  }
  if (email.scheduledAt.getTime() <= Date.now()) {
    throw new ServiceError("conflict", "This email is already being sent, so it can't be changed.");
  }
  return email;
}

async function adapterFor(email: EmailDoc, deps: SendDeps) {
  if (deps.adapter) return deps.adapter;
  const connection = await ConnectionModel.findOne({
    _id: email.connectionId,
    orgId: email.orgId,
    deletedAt: null,
  });
  if (!connection?.apiKey)
    throw new ServiceError("connection_inactive", "The Resend connection is unavailable.");
  return getResendAdapter(decryptSecret(connection.apiKey, { aad: keyAad(connection._id) }));
}

const alreadySent = () =>
  new ServiceError("conflict", "Resend already sent this email, so it can't be changed.");

/** Cancels a scheduled email in Resend first; it is marked canceled here only once Resend confirms. */
export async function cancelScheduledEmail(ctx: OrgContext, emailId: string, deps: SendDeps = {}) {
  authorize(ctx, "email:send");
  await connectDb();
  const email = await loadScheduled(ctx, emailId);
  if (email.resendId) {
    try {
      await (await adapterFor(email, deps)).cancelEmail(email.resendId);
    } catch (error) {
      if (
        isResendError(error) &&
        (error.code === "resend_validation" || error.code === "resend_not_found")
      ) {
        throw alreadySent();
      }
      throw error;
    }
  }
  // Not handed to Resend yet: cancel locally, but only if the job has not stored a resendId since.
  const updated = await EmailModel.findOneAndUpdate(
    {
      _id: email._id,
      orgId: email.orgId,
      status: { $in: PENDING_STATUSES },
      ...(email.resendId ? {} : { resendId: null }),
    },
    { $set: { status: "canceled" } },
    { returnDocument: "after" },
  );
  if (!updated) {
    // The job won the race and handed it to Resend: cancel there.
    const fresh = await EmailModel.findById(email._id);
    if (fresh?.resendId) {
      try {
        await (await adapterFor(fresh, deps)).cancelEmail(fresh.resendId);
      } catch {
        throw alreadySent();
      }
      await EmailModel.updateOne(
        { _id: fresh._id, orgId: fresh.orgId },
        { $set: { status: "canceled" } },
      );
    }
  }
  if (email.threadId) await recomputeThreadCache(email.orgId, email.threadId);
  await publish({
    orgId: email.orgId,
    projectId: email.projectId ?? null,
    topics: [
      "emails",
      `email:${email._id.toHexString()}`,
      ...(email.threadId ? ["threads", `thread:${email.threadId.toHexString()}`] : []),
    ],
    patch: { emailId: email._id.toHexString(), status: "canceled" },
  });
  return { emailId: email._id.toHexString(), status: "canceled" as const };
}

export async function rescheduleEmail(
  ctx: OrgContext,
  input: { emailId: string; scheduledAt: Date | string },
  deps: SendDeps = {},
) {
  authorize(ctx, "email:send");
  await connectDb();
  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    throw new ServiceError("validation", "Pick a time in the future.", {
      scheduledAt: ["Pick a time in the future"],
    });
  }
  const email = await loadScheduled(ctx, input.emailId);
  if (email.resendId) {
    try {
      await (
        await adapterFor(email, deps)
      ).updateScheduledEmail({
        id: email.resendId,
        scheduledAt: scheduledAt.toISOString(),
      });
    } catch (error) {
      if (
        isResendError(error) &&
        (error.code === "resend_validation" || error.code === "resend_not_found")
      ) {
        throw alreadySent();
      }
      throw error;
    }
  }
  await EmailModel.updateOne(
    { _id: email._id, orgId: email.orgId },
    { $set: { scheduledAt, status: "scheduled" } },
  );
  await publish({
    orgId: email.orgId,
    projectId: email.projectId ?? null,
    topics: ["emails", `email:${email._id.toHexString()}`],
    patch: { emailId: email._id.toHexString(), scheduledAt: scheduledAt.toISOString() },
  });
  return { emailId: email._id.toHexString(), scheduledAt: scheduledAt.toISOString() };
}

/* ------------------------------------------------------------------------------------------ */
/* Needs attention (UC-08b)                                                                    */
/* ------------------------------------------------------------------------------------------ */

export type NeedsAttentionDTO = {
  emailId: string;
  subject: string;
  scheduledAt: string | null;
  senderId: string;
  senderAddress: string;
  reason: string;
};

/** Queued and scheduled emails whose sender can no longer send. */
export async function listNeedsAttention(ctx: OrgContext): Promise<NeedsAttentionDTO[]> {
  authorize(ctx, "email:read");
  await connectDb();
  const orgId = orgOid(ctx);
  const broken = await SenderModel.find(
    { orgId, deletedAt: null, status: { $ne: "active" } },
    { address: 1, status: 1, statusReason: 1 },
  ).lean();
  if (broken.length === 0) return [];
  const bySender = new Map(broken.map((s) => [s._id.toHexString(), s]));
  const emails = await EmailModel.find({
    orgId,
    senderId: { $in: broken.map((s) => s._id) },
    status: { $in: PENDING_STATUSES },
    trashedAt: null,
    ...projectFilter(ctx),
  })
    .sort({ scheduledAt: 1, createdAt: 1 })
    .limit(200)
    .lean();
  return emails.map((e) => {
    const sender = bySender.get(e.senderId!.toHexString())!;
    return {
      emailId: e._id.toHexString(),
      subject: e.subject,
      scheduledAt: e.scheduledAt?.toISOString() ?? null,
      senderId: sender._id.toHexString(),
      senderAddress: sender.address,
      reason: sender.statusReason ?? sender.status,
    };
  });
}
