import "server-only";

import { Types } from "mongoose";

import { decryptSecret } from "@/lib/crypto/envelope";
import { connectDb } from "@/lib/db/connect";
import { parseId } from "@/lib/db/ids";
import { AttachmentModel } from "@/lib/db/models/attachments";
import { ConnectionModel } from "@/lib/db/models/connections";
import { EmailContentModel } from "@/lib/db/models/email-contents";
import { EmailModel } from "@/lib/db/models/emails";
import { withTransaction } from "@/lib/db/transaction";
import { env } from "@/lib/env";
import { enqueueFetchInbound } from "@/lib/jobs/send";
import { domainOf, parseAddress, parseAddressList } from "@/lib/mail/address";
import { parseRawMime, sanitizeFilename, type ParsedMessage } from "@/lib/mail/parse";
import {
  htmlToText,
  makeSnippet,
  normalizeContentId,
  referencedContentIds,
  sanitizeEmailHtml,
} from "@/lib/mail/sanitize";
import { publish } from "@/lib/realtime/publish";
import type { ResendAdapter } from "@/lib/resend/adapter";
import { getResendAdapter } from "@/lib/resend/client-factory";
import { isResendError } from "@/lib/resend/errors";
import type { ResendReceivedAttachment, ResendReceivedEmail } from "@/lib/resend/types";
import { getStore, storageKeys } from "@/lib/storage";
import { expireAtFrom, getMailSettings } from "./mail-settings";
import { externalAddresses, ownDomainNames } from "./mail-shared";
import type { FetchInboundRequest } from "./events-processing";
import { incrementRollups } from "./rollups";
import { attachMessageToThread } from "./threads";
import { keyAad } from "./webhook-secret";

/**
 * `fetch-inbound` (TRD §2.4): full body and attachments of a received email.
 *
 * Idempotent: an email whose content is `ready` is skipped; a retry after a partial failure
 * reuses attachment ids and overwrites the same storage keys. Errors other than "Resend no
 * longer has it" are thrown so the job's retry policy applies (5 attempts); the job's
 * `onFailure` then calls `markInboundFailed`.
 */

/** Resend's limit is 40 MB per email; raw MIME adds base64 overhead. */
const MAX_RAW_BYTES = 64 * 1024 * 1024;

export type FetchInboundResult =
  | { status: "ready"; threadId: string; attachments: number }
  | {
      status: "skipped";
      reason: "not_found" | "already_ready" | "not_inbound" | "connection_unavailable";
    }
  | { status: "unavailable" };

function parsedFromReceived(received: ResendReceivedEmail): ParsedMessage {
  const from = parseAddress(received.from);
  return {
    messageId: received.messageId || undefined,
    references: [],
    subject: received.subject,
    from: from ?? undefined,
    to: parseAddressList(received.to),
    cc: parseAddressList(received.cc),
    bcc: parseAddressList(received.bcc),
    replyTo: parseAddressList(received.replyTo),
    text: received.text,
    html: received.html,
    headers: [],
    attachments: [],
  };
}

export async function fetchInboundEmail(
  input: { emailId: string; orgId?: string },
  deps: { adapter?: ResendAdapter } = {},
): Promise<FetchInboundResult> {
  await connectDb();
  const emailId = parseId("emails", input.emailId);
  if (!emailId) return { status: "skipped", reason: "not_found" };
  const email = await EmailModel.findOne({
    _id: emailId,
    ...(input.orgId ? { orgId: input.orgId } : {}),
  });
  if (!email) return { status: "skipped", reason: "not_found" };
  if (email.direction !== "inbound" || !email.resendId)
    return { status: "skipped", reason: "not_inbound" };
  if (email.contentStatus === "ready") return { status: "skipped", reason: "already_ready" };

  const { orgId, connectionId } = email;
  const connection = await ConnectionModel.findOne({ _id: connectionId, orgId, deletedAt: null });
  if (!connection?.apiKey && !deps.adapter)
    return { status: "skipped", reason: "connection_unavailable" };
  const adapter =
    deps.adapter ??
    getResendAdapter(decryptSecret(connection!.apiKey!, { aad: keyAad(connection!._id) }));
  const settings = await getMailSettings(orgId);
  const store = getStore();
  const resendId = email.resendId;

  // 1. Metadata, raw MIME, attachment list.
  let received: ResendReceivedEmail;
  let attachmentList: ResendReceivedAttachment[];
  try {
    received = await adapter.getReceivedEmail(resendId);
    attachmentList = await adapter.listReceivedAttachments(resendId);
  } catch (error) {
    if (isResendError(error) && error.code === "resend_not_found") return markUnavailable(email);
    throw error;
  }

  let raw: Buffer | null = null;
  if (received.raw) {
    try {
      raw = await adapter.downloadFile(received.raw.downloadUrl, { maxBytes: MAX_RAW_BYTES });
    } catch (error) {
      if (!(isResendError(error) && error.code === "resend_not_found")) throw error;
      // The raw link expired between the two calls: fall back to the API's own text and HTML.
    }
  }
  const parsed = raw ? await parseRawMime(raw) : parsedFromReceived(received);

  // 2. Body: sanitize, keep `cid:` references, derive text and snippet.
  const rawHtml = parsed.html ?? received.html;
  const html = rawHtml ? sanitizeEmailHtml(rawHtml) : null;
  const text = parsed.text ?? received.text ?? (html ? htmlToText(html) : "");
  const referenced = html ? referencedContentIds(html) : new Set<string>();

  // 3. Raw MIME and attachments into storage (paid and trial) or metadata only (Free).
  const existing = new Map(
    (
      await AttachmentModel.find(
        { orgId, emailId, direction: "inbound" },
        { resendAttachmentId: 1 },
      ).lean()
    ).map((a) => [a.resendAttachmentId, a._id]),
  );
  const expireAt = expireAtFrom(new Date(), settings.retentionDays);

  const rawKey =
    raw && settings.storageMode === "r2" ? storageKeys.inboundRaw(orgId, emailId) : null;
  if (rawKey && raw) await store.put(rawKey, raw, { contentType: "message/rfc822" });

  const attachmentDocs: ({ _id: Types.ObjectId } & Record<string, unknown>)[] = [];
  for (const item of attachmentList) {
    const id = existing.get(item.id) ?? new Types.ObjectId();
    const contentId = item.contentId ? normalizeContentId(item.contentId) : undefined;
    const filename = sanitizeFilename(item.filename);
    let availability: "available" | "unavailable" = "available";
    let storageKey: string | null = null;
    if (settings.storageMode === "r2") {
      try {
        const bytes = await adapter.downloadFile(item.downloadUrl, { maxBytes: MAX_RAW_BYTES });
        storageKey = storageKeys.inboundAttachment(orgId, emailId, id);
        await store.put(storageKey, bytes, { contentType: item.contentType });
      } catch (error) {
        if (!(isResendError(error) && error.code === "resend_not_found")) throw error;
        availability = "unavailable";
      }
    }
    attachmentDocs.push({
      _id: id,
      orgId,
      emailId,
      direction: "inbound" as const,
      resendAttachmentId: item.id,
      filename,
      contentType: item.contentType || "application/octet-stream",
      size: item.size,
      contentId,
      disposition:
        item.contentDisposition === "inline" ? ("inline" as const) : ("attachment" as const),
      embedded: !!contentId && referenced.has(contentId),
      storageMode: settings.storageMode,
      storageKey,
      resendDownload:
        settings.storageMode === "resend"
          ? { url: item.downloadUrl, expiresAt: new Date(item.expiresAt) }
          : null,
      availability,
      uploadStatus: "stored" as const,
      expireAt,
    });
  }

  // 4. Persist, thread and update caches in one transaction.
  const own = await ownDomainNames(orgId);
  const fromAddress = parsed.from ?? parseAddress(received.from) ?? email.from;
  const toAll = parsed.to.length ? parsed.to : parseAddressList(received.to);
  const ccAll = parsed.cc.length ? parsed.cc : parseAddressList(received.cc);
  const mailbox =
    received.receivedFor.find((a) => own.has(domainOf(a))) ??
    toAll.find((a) => own.has(domainOf(a.address)))?.address ??
    received.receivedFor[0] ??
    toAll[0]?.address ??
    "";
  const participants = externalAddresses(
    [fromAddress.address, ...ccAll.map((a) => a.address), ...toAll.map((a) => a.address)],
    own,
  );
  const subject = parsed.subject || received.subject || email.subject;
  const snippet = makeSnippet(text);
  const messageId = parsed.messageId ?? received.messageId ?? email.messageId ?? undefined;
  const at = email.receivedAt ?? parsed.date ?? new Date();

  const result = await withTransaction(async (session) => {
    // A concurrent run may have finished first.
    const fresh = await EmailModel.findOne(
      { _id: emailId, orgId },
      { contentStatus: 1 },
      { session },
    ).lean();
    if (!fresh) return null;
    if (fresh.contentStatus === "ready") return "already" as const;

    await EmailContentModel.updateOne(
      { emailId },
      {
        $set: {
          orgId,
          html: html ?? undefined,
          text,
          headers: parsed.headers,
          rawStorageKey: rawKey,
          expireAt,
        },
      },
      { upsert: true, session },
    );
    for (const doc of attachmentDocs) {
      await AttachmentModel.replaceOne({ _id: doc._id }, doc, { upsert: true, session });
    }

    const threaded = await attachMessageToThread(
      {
        orgId,
        connectionId,
        domainId: email.domainId ?? null,
        projectId: email.projectId ?? null,
        direction: "inbound",
        mailboxAddress: mailbox.toLowerCase(),
        subject,
        participants,
        at,
        snippet,
        hasAttachments: attachmentDocs.length > 0,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
      },
      { session },
    );

    await EmailModel.updateOne(
      { _id: emailId, orgId },
      {
        $set: {
          threadId: threaded.threadId,
          contentStatus: "ready",
          subject,
          snippet,
          from: fromAddress,
          to: toAll,
          cc: ccAll,
          replyTo: parsed.replyTo,
          recipientAddresses: [...new Set([...toAll, ...ccAll].map((a) => a.address))],
          hasAttachments: attachmentDocs.length > 0,
          ...(messageId ? { messageId } : {}),
          ...(parsed.inReplyTo ? { inReplyTo: parsed.inReplyTo } : {}),
          references: parsed.references,
        },
      },
      { session },
    );

    if (!threaded.created && threaded.via === "message_id") {
      // A reply to a conversation we took part in.
      await incrementRollups(
        {
          orgId,
          connectionId,
          domainId: email.domainId ?? null,
          projectId: email.projectId ?? null,
        },
        { at, stream: "inbound", counters: { replied: 1 } },
        { session },
      );
    }

    await publish(
      {
        orgId,
        projectId: email.projectId ?? null,
        topics: [
          "emails",
          "threads",
          `email:${emailId.toHexString()}`,
          `thread:${threaded.threadId.toHexString()}`,
        ],
        patch: { emailId: emailId.toHexString(), contentStatus: "ready" },
      },
      { session },
    );
    // TODO(phase 5/7): notify members (`inbound_received`), enqueue `ai-triage` when AI is on.
    return threaded.threadId;
  });

  if (result === null) return { status: "skipped", reason: "not_found" };
  if (result === "already") return { status: "skipped", reason: "already_ready" };
  return { status: "ready", threadId: result.toHexString(), attachments: attachmentDocs.length };
}

async function markUnavailable(
  email: InstanceType<typeof EmailModel>,
): Promise<FetchInboundResult> {
  await EmailModel.updateOne(
    { _id: email._id, orgId: email.orgId },
    { $set: { contentStatus: "unavailable" } },
  );
  await publish({
    orgId: email.orgId,
    projectId: email.projectId ?? null,
    topics: ["emails", `email:${email._id.toHexString()}`],
    patch: { contentStatus: "unavailable" },
  });
  return { status: "unavailable" };
}

/** Called when every retry is used up: the thread shows metadata with "Content unavailable, retry". */
export async function markInboundFailed(emailId: string): Promise<void> {
  await connectDb();
  const id = parseId("emails", emailId);
  if (!id) return;
  const email = await EmailModel.findOneAndUpdate(
    { _id: id, contentStatus: { $in: ["pending", "failed"] } },
    { $set: { contentStatus: "failed" } },
    { returnDocument: "after" },
  );
  if (!email) return;
  await publish({
    orgId: email.orgId,
    projectId: email.projectId ?? null,
    topics: ["emails", `email:${email._id.toHexString()}`],
    patch: { contentStatus: "failed" },
  });
}

/**
 * Enqueues `fetch-inbound`. In development without an Inngest server the job cannot be
 * delivered, so it runs in this process instead (the same fallback as sync).
 */
export async function dispatchFetchInbound(
  request: FetchInboundRequest,
): Promise<"queued" | "inline"> {
  const delivered = await enqueueFetchInbound(request);
  if (!delivered && env.INNGEST_DEV && env.NODE_ENV !== "production") {
    void fetchInboundEmail({ emailId: request.emailId, orgId: request.orgId }).catch((error) =>
      console.error("[inbound] inline fetch failed", error),
    );
    return "inline";
  }
  return "queued";
}
