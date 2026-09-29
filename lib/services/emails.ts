import "server-only";

import { Types, type PipelineStage } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { AttachmentModel } from "@/lib/db/models/attachments";
import { DomainModel } from "@/lib/db/models/domains";
import { EmailContentModel } from "@/lib/db/models/email-contents";
import { EmailModel, type Email, type EmailStatus } from "@/lib/db/models/emails";
import { ThreadMemberStateModel } from "@/lib/db/models/thread-member-states";
import { ThreadModel } from "@/lib/db/models/threads";
import { WebhookEventModel } from "@/lib/db/models/webhook-events";
import type {
  ActivityRowDTO,
  AddressDTO,
  AttachmentDTO,
  EmailTimelineDTO,
  MailFolder,
  MailListRowDTO,
  MessageDTO,
  Page,
  ReceiptSummaryDTO,
  ThreadDetailDTO,
} from "@/lib/dto/mail";
import { replaceContentIds } from "@/lib/mail/sanitize";
import { isInlineImageType } from "@/lib/storage/disposition";
import { ServiceError } from "./errors";
import { attachmentInlineUrl } from "./attachments";
import { toAttachmentDTO } from "./drafts";
import { dispatchFetchInbound } from "./inbound";
import { projectFilter } from "./project-scope";

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);
const userOid = (ctx: OrgContext) => new Types.ObjectId(ctx.user.id);
const hex = (id: Types.ObjectId | null | undefined) => id?.toHexString() ?? null;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/* ------------------------------------------------------------------------------------------ */
/* Keyset cursors                                                                              */
/* ------------------------------------------------------------------------------------------ */

type Cursor = { t: string; id: string };

const encodeCursor = (t: Date, id: Types.ObjectId) =>
  Buffer.from(
    JSON.stringify({ t: t.toISOString(), id: id.toHexString() } satisfies Cursor),
  ).toString("base64url");

function decodeCursor(cursor: string | null | undefined): { t: Date; id: Types.ObjectId } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Cursor;
    const t = new Date(parsed.t);
    if (Number.isNaN(t.getTime()) || !/^[0-9a-f]{24}$/i.test(parsed.id)) return null;
    return { t, id: new Types.ObjectId(parsed.id) };
  } catch {
    return null;
  }
}

/** Keyset condition for `(field, _id)` ordering, descending (`dir: -1`) or ascending. */
function after(field: string, cursor: { t: Date; id: Types.ObjectId } | null, dir: 1 | -1) {
  if (!cursor) return {};
  const cmp = dir === -1 ? "$lt" : "$gt";
  return {
    $or: [{ [field]: { [cmp]: cursor.t } }, { [field]: cursor.t, _id: { [cmp]: cursor.id } }],
  };
}

const pageSize = (limit?: number) =>
  Math.min(Math.max(Math.floor(limit ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);

/* ------------------------------------------------------------------------------------------ */
/* Inbox, Sent, Scheduled, Trash                                                               */
/* ------------------------------------------------------------------------------------------ */

export type ListThreadsInput = {
  folder: MailFolder;
  cursor?: string | null;
  limit?: number;
  /** Full-text search over subject, snippet and sender (MVP: MongoDB text index). */
  q?: string;
  /** Inbox only: unread for the calling member. */
  unread?: boolean;
  /** Inbox only. */
  mailboxAddress?: string;
  assigneeId?: string | "none" | "me";
  projectId?: string;
  connectionId?: string;
  starred?: boolean;
};

type ThreadLean = {
  _id: Types.ObjectId;
  subject: string;
  snippet: string;
  participants: string[];
  lastMessageAt: Date;
  messageCount: number;
  starred: boolean;
  hasAttachments: boolean;
  projectId?: Types.ObjectId | null;
  trashedAt?: Date | null;
  purgeAt?: Date | null;
  unread?: boolean;
};

/** Display name when the message carried one, else the address. */
export const displayLabel = (a: { address: string; name?: string | null }) =>
  a.name?.trim() || a.address;

const threadRow = (t: ThreadLean): MailListRowDTO => ({
  kind: "thread",
  id: t._id.toHexString(),
  threadId: t._id.toHexString(),
  subject: t.subject,
  snippet: t.snippet,
  people: t.participants,
  peopleLabels: t.participants,
  lastMessageAt: t.lastMessageAt.toISOString(),
  messageCount: t.messageCount,
  unread: !!t.unread,
  starred: t.starred,
  hasAttachments: t.hasAttachments,
  projectId: hex(t.projectId),
  status: null,
  scheduledAt: null,
  trashedAt: t.trashedAt?.toISOString() ?? null,
  purgeAt: t.purgeAt?.toISOString() ?? null,
});

type EmailLean = Pick<
  Email,
  | "direction"
  | "status"
  | "subject"
  | "snippet"
  | "hasAttachments"
  | "scheduledAt"
  | "trashedAt"
  | "purgeAt"
  | "sentAt"
  | "receivedAt"
> & {
  _id: Types.ObjectId;
  threadId?: Types.ObjectId | null;
  projectId?: Types.ObjectId | null;
  to: AddressDTO[];
  from: AddressDTO;
  createdAt: Date;
};

const emailRow = (e: EmailLean): MailListRowDTO => ({
  kind: "email",
  id: e._id.toHexString(),
  threadId: hex(e.threadId),
  subject: e.subject,
  snippet: e.snippet,
  people: e.direction === "outbound" ? e.to.map((a) => a.address) : [e.from.address],
  peopleLabels: (e.direction === "outbound" ? e.to : [e.from]).map(displayLabel),
  lastMessageAt: (e.receivedAt ?? e.sentAt ?? e.createdAt).toISOString(),
  messageCount: 1,
  unread: false,
  starred: false,
  hasAttachments: e.hasAttachments,
  projectId: hex(e.projectId),
  status: e.status,
  scheduledAt: e.scheduledAt?.toISOString() ?? null,
  trashedAt: e.trashedAt?.toISOString() ?? null,
  purgeAt: e.purgeAt?.toISOString() ?? null,
});

/**
 * Threads only store participant addresses; the display names live on their emails. Looks up the
 * newest name seen for each address in these threads (one query per page) so list rows can show
 * "Jane Doe" instead of "jane@northwind.io"; an address without a known name stays as it is.
 */
async function withPeopleLabels(
  orgId: Types.ObjectId,
  rows: MailListRowDTO[],
): Promise<MailListRowDTO[]> {
  const threadIds = rows.filter((r) => r.kind === "thread" && r.threadId).map((r) => r.threadId!);
  if (threadIds.length === 0) return rows;
  const emails = await EmailModel.find(
    { orgId, threadId: { $in: threadIds.map((id) => new Types.ObjectId(id)) } },
    { threadId: 1, from: 1, to: 1 },
  )
    .sort({ createdAt: -1 })
    .limit(threadIds.length * 12)
    .lean();
  const names = new Map<string, Map<string, string>>();
  for (const email of emails) {
    const key = email.threadId!.toHexString();
    const byAddress = names.get(key) ?? new Map<string, string>();
    for (const a of [email.from, ...(email.to ?? [])]) {
      const name = a?.name?.trim();
      const address = a?.address?.toLowerCase();
      if (name && address && !byAddress.has(address)) byAddress.set(address, name);
    }
    names.set(key, byAddress);
  }
  return rows.map((row) => {
    if (row.kind !== "thread" || !row.threadId) return row;
    const known = names.get(row.threadId);
    if (!known) return row;
    return { ...row, peopleLabels: row.people.map((p) => known.get(p.toLowerCase()) ?? p) };
  });
}

async function matchingThreadIds(ctx: OrgContext, q: string): Promise<Types.ObjectId[]> {
  const emails = await EmailModel.find(
    { orgId: orgOid(ctx), $text: { $search: q }, threadId: { $ne: null }, ...projectFilter(ctx) },
    { threadId: 1 },
  )
    .limit(500)
    .lean();
  return [...new Map(emails.map((e) => [e.threadId!.toHexString(), e.threadId!])).values()];
}

async function inboxThreads(
  ctx: OrgContext,
  input: ListThreadsInput,
  limit: number,
  cursor: ReturnType<typeof decodeCursor>,
  extra: Record<string, unknown> = {},
) {
  const orgId = orgOid(ctx);
  const userId = userOid(ctx);
  const match: Record<string, unknown> = {
    orgId,
    ...projectFilter(ctx),
    messageCount: { $gt: 0 },
    ...extra,
    ...after("lastMessageAt", cursor, -1),
  };
  if (input.mailboxAddress) match.mailboxAddress = input.mailboxAddress.toLowerCase();
  if (input.connectionId && Types.ObjectId.isValid(input.connectionId)) {
    match.connectionId = new Types.ObjectId(input.connectionId);
  }
  if (input.projectId && Types.ObjectId.isValid(input.projectId)) {
    // Narrowing inside the member's own scope: intersect, never widen.
    const wanted = new Types.ObjectId(input.projectId);
    const scoped = projectFilter(ctx).projectId?.$in;
    match.projectId = scoped && !scoped.some((p) => p.equals(wanted)) ? { $in: [] } : wanted;
  }
  if (input.assigneeId === "none") match.assigneeId = null;
  else if (input.assigneeId === "me") match.assigneeId = userId;
  else if (input.assigneeId && Types.ObjectId.isValid(input.assigneeId)) {
    match.assigneeId = new Types.ObjectId(input.assigneeId);
  }
  if (input.starred) match.starred = true;
  if (input.q?.trim()) match._id = { $in: await matchingThreadIds(ctx, input.q.trim()) };

  const lookup: PipelineStage[] = [
    {
      $lookup: {
        from: "thread_member_states",
        let: { tid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $eq: ["$threadId", "$$tid"] }, { $eq: ["$userId", userId] }] },
            },
          },
          { $project: { lastReadAt: 1 } },
        ],
        as: "state",
      },
    },
    {
      $addFields: {
        unread: {
          $and: [
            { $ne: [{ $type: "$lastInboundAt" }, "missing"] },
            {
              $or: [
                { $eq: [{ $size: "$state" }, 0] },
                { $gt: ["$lastInboundAt", { $arrayElemAt: ["$state.lastReadAt", 0] }] },
              ],
            },
          ],
        },
      },
    },
  ];
  const sort: PipelineStage = { $sort: { lastMessageAt: -1, _id: -1 } };
  const cut: PipelineStage = { $limit: limit + 1 };
  const pipeline: PipelineStage[] = [
    { $match: match },
    ...(input.unread
      ? [...lookup, { $match: { unread: true } }, sort, cut]
      : [sort, cut, ...lookup]),
  ];
  return ThreadModel.aggregate<ThreadLean>(pipeline);
}

/**
 * Mail lists (TRD §2.6 keyset pagination, DBD §6 indexes). `inbox` returns conversations;
 * `sent` and `scheduled` return the app's own outbound emails; `trash` returns trashed
 * conversations and single trashed emails. Everything is scoped to the caller's org and
 * `projectFilter`; Trash and all other lists exclude what belongs elsewhere.
 */
export async function listThreads(
  ctx: OrgContext,
  input: ListThreadsInput,
): Promise<Page<MailListRowDTO>> {
  authorize(
    ctx,
    input.folder === "inbox" || input.folder === "trash" ? "thread:read" : "email:read",
  );
  await connectDb();
  const orgId = orgOid(ctx);
  const limit = pageSize(input.limit);
  const cursor = decodeCursor(input.cursor);
  const q = input.q?.trim();

  if (input.folder === "inbox") {
    const threads = await inboxThreads(ctx, input, limit, cursor, {
      trashedAt: null,
      archived: false,
    });
    const more = threads.length > limit;
    const page = threads.slice(0, limit);
    return {
      items: await withPeopleLabels(orgId, page.map(threadRow)),
      nextCursor: more ? encodeCursor(page.at(-1)!.lastMessageAt, page.at(-1)!._id) : null,
    };
  }

  if (input.folder === "sent" || input.folder === "scheduled") {
    const scheduled = input.folder === "scheduled";
    const dir = scheduled ? 1 : -1;
    const field = scheduled ? "scheduledAt" : "createdAt";
    const filter: Record<string, unknown> = {
      orgId,
      direction: "outbound",
      origin: "app",
      trashedAt: null,
      ...projectFilter(ctx),
      ...(scheduled
        ? { status: { $in: ["scheduled", "queued"] }, scheduledAt: { $ne: null } }
        : { status: { $nin: ["draft", "scheduled", "canceled"] } }),
      ...(q ? { $text: { $search: q } } : {}),
    };
    if (input.connectionId && Types.ObjectId.isValid(input.connectionId)) {
      filter.connectionId = new Types.ObjectId(input.connectionId);
    }
    const cond = after(field, cursor, dir);
    const emails = await EmailModel.find({ ...filter, ...(cursor ? cond : {}) })
      .sort({ [field]: dir, _id: dir })
      .limit(limit + 1)
      .lean();
    const more = emails.length > limit;
    const page = emails.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((e) => emailRow(e as unknown as EmailLean)),
      nextCursor:
        more && last ? encodeCursor((last[field] as Date) ?? last.createdAt, last._id) : null,
    };
  }

  // Trash: whole threads, and single emails whose thread is not itself in Trash.
  const trashedCond = after("trashedAt", cursor, -1);
  const [threads, emails] = await Promise.all([
    ThreadModel.find({ orgId, trashedAt: { $ne: null }, ...projectFilter(ctx), ...trashedCond })
      .sort({ trashedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean(),
    EmailModel.aggregate<EmailLean & { thread?: { trashedAt?: Date | null }[] }>([
      { $match: { orgId, trashedAt: { $ne: null }, ...projectFilter(ctx), ...trashedCond } },
      { $sort: { trashedAt: -1, _id: -1 } },
      { $limit: limit + 1 },
      { $lookup: { from: "threads", localField: "threadId", foreignField: "_id", as: "thread" } },
      { $match: { $or: [{ thread: { $size: 0 } }, { "thread.trashedAt": null }] } },
    ]),
  ]);
  const merged = [
    ...threads.map((t) => ({
      at: t.trashedAt!,
      id: t._id,
      row: threadRow(t as unknown as ThreadLean),
    })),
    ...emails.map((e) => ({ at: e.trashedAt!, id: e._id, row: emailRow(e) })),
  ].sort(
    (a, b) =>
      b.at.getTime() - a.at.getTime() || b.id.toHexString().localeCompare(a.id.toHexString()),
  );
  const page = merged.slice(0, limit);
  const more = merged.length > limit;
  return {
    items: await withPeopleLabels(
      orgId,
      page.map((m) => m.row),
    ),
    nextCursor: more ? encodeCursor(page.at(-1)!.at, page.at(-1)!.id) : null,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Thread detail                                                                               */
/* ------------------------------------------------------------------------------------------ */

const addr = (a: { address: string; name?: string | null }): AddressDTO => ({
  address: a.address,
  ...(a.name ? { name: a.name } : {}),
});

/** Delivery-timeline event types shown as read receipts. */
const RECEIPT_TYPES = [
  "email.scheduled",
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
];

/**
 * One conversation: messages in order, sanitized HTML with embedded images mapped to signed
 * URLs, attachment lists, and read receipts (from the timeline) for our outbound messages.
 * Trashed and canceled messages are left out.
 */
export async function getThread(ctx: OrgContext, threadId: string): Promise<ThreadDetailDTO> {
  authorize(ctx, "thread:read");
  await connectDb();
  const orgId = orgOid(ctx);
  if (!Types.ObjectId.isValid(threadId)) throw new ServiceError("not_found", "Thread not found.");
  const thread = await ThreadModel.findOne({ _id: threadId, orgId, ...projectFilter(ctx) }).lean();
  if (!thread) throw new ServiceError("not_found", "Thread not found.");

  const emails = await EmailModel.find({
    orgId,
    threadId: thread._id,
    trashedAt: null,
    status: { $nin: ["canceled", "draft"] },
  }).lean();
  const at = (e: (typeof emails)[number]) =>
    e.receivedAt ?? e.sentAt ?? e.scheduledAt ?? e.createdAt;
  emails.sort(
    (a, b) =>
      at(a).getTime() - at(b).getTime() || a._id.toHexString().localeCompare(b._id.toHexString()),
  );
  const emailIds = emails.map((e) => e._id);
  const outboundIds = emails.filter((e) => e.direction === "outbound").map((e) => e._id);

  const [contents, attachments, events, domains, state] = await Promise.all([
    EmailContentModel.find(
      { orgId, emailId: { $in: emailIds } },
      { html: 1, text: 1, emailId: 1 },
    ).lean(),
    AttachmentModel.find({ orgId, emailId: { $in: emailIds } }).sort({ _id: 1 }),
    outboundIds.length
      ? WebhookEventModel.find(
          { orgId, emailId: { $in: outboundIds }, type: { $in: RECEIPT_TYPES } },
          { emailId: 1, type: 1, occurredAt: 1 },
        )
          .sort({ occurredAt: 1, _id: 1 })
          .lean()
      : [],
    DomainModel.find(
      {
        orgId,
        _id: { $in: emails.map((e) => e.domainId).filter((d): d is Types.ObjectId => !!d) },
      },
      { openTracking: 1 },
    ).lean(),
    ThreadMemberStateModel.findOne(
      { threadId: thread._id, userId: userOid(ctx) },
      { lastReadAt: 1 },
    ).lean(),
  ]);
  const contentBy = new Map(contents.map((c) => [c.emailId.toHexString(), c]));
  const attachmentsBy = new Map<string, typeof attachments>();
  for (const a of attachments) {
    const key = a.emailId!.toHexString();
    attachmentsBy.set(key, [...(attachmentsBy.get(key) ?? []), a]);
  }
  const eventsBy = new Map<string, { type: string; at: string }[]>();
  for (const ev of events) {
    const key = ev.emailId!.toHexString();
    eventsBy.set(key, [
      ...(eventsBy.get(key) ?? []),
      { type: ev.type, at: ev.occurredAt.toISOString() },
    ]);
  }
  const tracking = new Map(domains.map((d) => [d._id.toHexString(), !!d.openTracking]));

  const messages: MessageDTO[] = [];
  for (const e of emails) {
    const id = e._id.toHexString();
    const content = contentBy.get(id);
    const list = attachmentsBy.get(id) ?? [];

    // Signed inline URLs for every image the HTML references by `cid:`.
    const byCid = new Map(list.filter((a) => a.contentId).map((a) => [a.contentId!, a]));
    const urls = new Map<string, string | null>();
    for (const [cid, att] of byCid) urls.set(cid, await attachmentInlineUrl(att));
    const html =
      content?.html === undefined || content.html === null
        ? null
        : replaceContentIds(content.html, (cid) => urls.get(cid) ?? null);

    const dtos: AttachmentDTO[] = [];
    for (const att of list) {
      const dto = toAttachmentDTO(att);
      if (
        !att.embedded &&
        isInlineImageType(att.contentType) &&
        att.availability !== "unavailable"
      ) {
        dto.thumbnailUrl = await attachmentInlineUrl(att);
      }
      dtos.push(dto);
    }

    messages.push({
      id,
      direction: e.direction,
      status: e.status,
      from: addr(e.from),
      to: e.to.map(addr),
      cc: e.cc.map(addr),
      bcc: e.direction === "outbound" ? e.bcc.map(addr) : [],
      subject: e.subject,
      snippet: e.snippet,
      at: at(e).toISOString(),
      scheduledAt: e.scheduledAt?.toISOString() ?? null,
      authorId: hex(e.authorId),
      contentStatus: e.contentStatus ?? null,
      html,
      text: content?.text ?? null,
      attachments: dtos,
      receipts:
        e.direction === "outbound"
          ? receiptSummary(
              e,
              eventsBy.get(id) ?? [],
              e.domainId ? (tracking.get(e.domainId.toHexString()) ?? false) : false,
            )
          : null,
    });
  }

  const unread =
    !!thread.lastInboundAt &&
    (!state || thread.lastInboundAt.getTime() > state.lastReadAt.getTime());
  return {
    id: thread._id.toHexString(),
    subject: thread.subject,
    mailboxAddress: thread.mailboxAddress,
    participants: thread.participants,
    messageCount: thread.messageCount,
    starred: thread.starred,
    archived: thread.archived,
    assigneeId: hex(thread.assigneeId),
    unread,
    projectId: hex(thread.projectId),
    messages,
  };
}

function receiptSummary(
  e: {
    status: EmailStatus;
    sentAt?: Date | null;
    deliveredAt?: Date | null;
    firstOpenedAt?: Date | null;
    lastOpenedAt?: Date | null;
    firstClickedAt?: Date | null;
    openCount: number;
    clickCount: number;
    likelyAutomatedOpen: boolean;
    bounce?: { type: "hard" | "soft"; message?: string | null } | null;
  },
  events: { type: string; at: string }[],
  opensTracked: boolean,
): ReceiptSummaryDTO {
  return {
    status: e.status,
    sentAt: e.sentAt?.toISOString() ?? null,
    deliveredAt: e.deliveredAt?.toISOString() ?? null,
    firstOpenedAt: e.firstOpenedAt?.toISOString() ?? null,
    lastOpenedAt: e.lastOpenedAt?.toISOString() ?? null,
    openCount: e.openCount,
    firstClickedAt: e.firstClickedAt?.toISOString() ?? null,
    clickCount: e.clickCount,
    likelyAutomatedOpen: e.likelyAutomatedOpen,
    opensTracked,
    bounce: e.bounce ? { type: e.bounce.type, message: e.bounce.message ?? null } : null,
    events,
  };
}

/** "Content unavailable, retry": puts a failed inbound email back in the fetch queue. */
export async function retryInboundFetch(ctx: OrgContext, emailId: string): Promise<void> {
  authorize(ctx, "thread:read");
  await connectDb();
  if (!Types.ObjectId.isValid(emailId)) throw new ServiceError("not_found", "Email not found.");
  const email = await EmailModel.findOneAndUpdate(
    {
      _id: emailId,
      orgId: orgOid(ctx),
      direction: "inbound",
      contentStatus: { $in: ["failed", "pending"] },
      ...projectFilter(ctx),
    },
    { $set: { contentStatus: "pending" } },
    { returnDocument: "after" },
  );
  if (!email) throw new ServiceError("not_found", "Email not found.");
  await dispatchFetchInbound({
    emailId: email._id.toHexString(),
    orgId: email.orgId.toHexString(),
    connectionId: email.connectionId.toHexString(),
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Activity log                                                                                */
/* ------------------------------------------------------------------------------------------ */

export type ActivityFilters = {
  connectionId?: string;
  projectId?: string;
  domainId?: string;
  direction?: "inbound" | "outbound";
  /** Status filter, e.g. `["bounced", "complained"]`. */
  statuses?: EmailStatus[];
  tag?: { name: string; value?: string };
  templateId?: string;
  /** Everything sent to or received from this address, across accounts. */
  recipient?: string;
  from?: Date | string;
  to?: Date | string;
  q?: string;
};

const oid = (value: string | undefined) =>
  value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined;

const activityRow = (
  e: EmailLean & {
    connectionId: Types.ObjectId;
    domainId?: Types.ObjectId | null;
    origin: "app" | "external" | "broadcast";
    tags: { name?: string | null; value?: string | null }[];
    openCount: number;
    clickCount: number;
  },
): ActivityRowDTO => ({
  id: e._id.toHexString(),
  direction: e.direction,
  origin: e.origin,
  status: e.status,
  connectionId: e.connectionId.toHexString(),
  domainId: hex(e.domainId),
  projectId: hex(e.projectId),
  from: addr(e.from),
  to: e.to.map((a) => a.address),
  subject: e.subject,
  tags: e.tags.map((t) => ({ name: t.name ?? "", value: t.value ?? "" })),
  openCount: e.openCount,
  clickCount: e.clickCount,
  at: (e.receivedAt ?? e.sentAt ?? e.createdAt).toISOString(),
  threadId: hex(e.threadId),
});

/**
 * Activity log (PRD §5.4): every email, both directions, newest first, with the filters of the
 * event stream. Cursor is keyset on `(createdAt, _id)`.
 */
export async function listActivity(
  ctx: OrgContext,
  input: { filters?: ActivityFilters; cursor?: string | null; limit?: number } = {},
): Promise<Page<ActivityRowDTO>> {
  authorize(ctx, "activity:read");
  await connectDb();
  const f = input.filters ?? {};
  const limit = pageSize(input.limit);
  const cursor = decodeCursor(input.cursor);
  const filter: Record<string, unknown> = {
    orgId: orgOid(ctx),
    trashedAt: null,
    status: { $ne: "draft" },
    ...projectFilter(ctx),
  };
  const projectId = oid(f.projectId);
  if (projectId) {
    const scoped = projectFilter(ctx).projectId?.$in;
    filter.projectId = scoped && !scoped.some((p) => p.equals(projectId)) ? { $in: [] } : projectId;
  }
  const connectionId = oid(f.connectionId);
  if (connectionId) filter.connectionId = connectionId;
  const domainId = oid(f.domainId);
  if (domainId) filter.domainId = domainId;
  const templateId = oid(f.templateId);
  if (templateId) filter.templateId = templateId;
  if (f.direction) filter.direction = f.direction;
  if (f.statuses?.length) filter.status = { $in: f.statuses };
  if (f.tag?.name) {
    filter.tags = {
      $elemMatch: { name: f.tag.name, ...(f.tag.value ? { value: f.tag.value } : {}) },
    };
  }
  if (f.recipient) {
    const address = f.recipient.trim().toLowerCase();
    filter.$and = [{ $or: [{ recipientAddresses: address }, { "from.address": address }] }];
  }
  if (f.from || f.to) {
    filter.createdAt = {
      ...(f.from ? { $gte: new Date(f.from) } : {}),
      ...(f.to ? { $lte: new Date(f.to) } : {}),
    };
  }
  if (f.q?.trim()) filter.$text = { $search: f.q.trim() };

  const query: Record<string, unknown> = { ...filter };
  if (cursor) {
    const cond = after("createdAt", cursor, -1);
    // Combine with an existing createdAt range through $and.
    query.$and = [...((filter.$and as unknown[]) ?? []), cond];
  }
  const rows = await EmailModel.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    items: page.map((e) => activityRow(e as never)),
    nextCursor: more ? encodeCursor(page.at(-1)!.createdAt, page.at(-1)!._id) : null,
  };
}

/**
 * One email with its event timeline, oldest first, for the raw-payload viewer. Events are the
 * stored webhooks, so they outlive Resend's retention.
 */
export async function getEmailTimeline(
  ctx: OrgContext,
  emailId: string,
): Promise<EmailTimelineDTO> {
  authorize(ctx, "activity:read");
  await connectDb();
  if (!Types.ObjectId.isValid(emailId)) throw new ServiceError("not_found", "Email not found.");
  const orgId = orgOid(ctx);
  const email = await EmailModel.findOne({ _id: emailId, orgId, ...projectFilter(ctx) }).lean();
  if (!email) throw new ServiceError("not_found", "Email not found.");
  const events = await WebhookEventModel.find({ orgId, emailId: email._id })
    .sort({ occurredAt: 1, _id: 1 })
    .limit(500)
    .lean();
  return {
    email: activityRow(email as never),
    entries: events.map((ev) => ({
      id: ev._id.toHexString(),
      type: ev.type,
      occurredAt: ev.occurredAt.toISOString(),
      payload: ev.payload,
    })),
  };
}
