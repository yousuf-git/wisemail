import "server-only";

import { Types, type ClientSession } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { decryptSecret } from "@/lib/crypto/envelope";
import { connectDb } from "@/lib/db/connect";
import { ApiKeyModel } from "@/lib/db/models/api-keys";
import { AutomationModel } from "@/lib/db/models/automations";
import { BroadcastModel } from "@/lib/db/models/broadcasts";
import { ConnectionModel, type ConnectionDoc } from "@/lib/db/models/connections";
import { ContactPropertyModel } from "@/lib/db/models/contact-properties";
import { ContactModel } from "@/lib/db/models/contacts";
import { DomainModel } from "@/lib/db/models/domains";
import type { MirrorKind } from "@/lib/db/models/mirror";
import { SegmentModel } from "@/lib/db/models/segments";
import { SyncRunModel, type SyncRunDoc } from "@/lib/db/models/sync-run";
import { TemplateModel } from "@/lib/db/models/templates";
import { TopicModel } from "@/lib/db/models/topics";
import { withTransaction } from "@/lib/db/transaction";
import type { RefModel } from "@/lib/db/refs";
import {
  SYNC_STAGE_LABELS,
  type SyncRequestResult,
  type SyncStageKey,
  type SyncStatusDTO,
} from "@/lib/dto/sync";
import { env } from "@/lib/env";
import { enqueueConnectionSync } from "@/lib/jobs/send";
import { publish } from "@/lib/realtime/publish";
import type { ResendAdapter } from "@/lib/resend/adapter";
import { getResendAdapter } from "@/lib/resend/client-factory";
import { isResendError, type ResendError } from "@/lib/resend/errors";
import type { Page } from "@/lib/resend/types";
import { writeAuditLog } from "./audit";
import { recomputeSenderStatuses } from "./senders";
import { recomputeChecklist } from "./checklist";
import { ServiceError } from "./errors";
import { keyAad } from "./webhook-secret";
import { notifyConnectionAttention } from "./mail-notifications";

/**
 * `sync-connection` (TRD §2.2 step 4, §2.3). One sync is a `sync_runs` document with a checkpoint
 * per stage. `syncNextPage` does exactly one page of the current stage and records where it
 * stopped, so the Inngest function can wrap each call in its own `step.run` (durable, resumable)
 * and a timed-out or crashed run picks up at the saved cursor.
 *
 * Mirrors are upserted by `(connectionId, resendId)` and stamped `syncedAt = run.startedAt`.
 * Once a stage has walked its whole list, mirrors with an older stamp no longer exist in Resend
 * and are removed. A stage that did not finish never removes anything.
 */

export type SyncTrigger = "initial" | "scheduled" | "manual";

/* ------------------------------------------------------------------------------------------ */
/* Stages                                                                                      */
/* ------------------------------------------------------------------------------------------ */

type StageContext = {
  orgId: Types.ObjectId;
  connectionId: Types.ObjectId;
  adapter: ResendAdapter;
  /** The run's `startedAt`; stamped on every mirror the run sees. */
  stamp: Date;
  /** Where the previous page stopped; undefined on a stage's first page. */
  cursor: string | undefined;
  /** Every Resend call goes through here so a page stays under the per-team rate limit. */
  call: <T>(fn: () => Promise<T>) => Promise<T>;
};

type StageResult = { count: number; nextCursor?: string };

type StageDef = {
  key: string;
  /** Realtime topic for the affected resource. */
  topic: MirrorKind | null;
  /** Mirror collection whose unseen documents are removed when the stage completes. */
  model: RefModel | null;
  run: (ctx: StageContext) => Promise<StageResult>;
  /** Cleanup of references to removed mirrors (ids are `_id`s of the removed documents). */
  onRemoved?: (
    ctx: StageContext,
    removedIds: Types.ObjectId[],
    session: ClientSession,
  ) => Promise<void>;
  onComplete?: (ctx: StageContext, session: ClientSession) => Promise<void>;
};

/** Resend's minimum interval between calls we allow ourselves (8 req/s of the team's 10). */
const CALL_INTERVAL_MS = env.NODE_ENV === "test" ? 0 : 125;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function makePacer() {
  let next = 0;
  return async function call<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + CALL_INTERVAL_MS;
    if (at > now) await sleep(at - now);
    return fn();
  };
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

const date = (value: string | null | undefined) => (value ? new Date(value) : undefined);

type Upsert = { resendId: string; set: Record<string, unknown> };

/** Idempotent upsert by `(connectionId, resendId)`; stamps `syncedAt`. */
async function upsertMirrors(model: RefModel, ctx: StageContext, items: Upsert[]) {
  if (items.length === 0) return;
  await model.bulkWrite(
    items.map((item) => ({
      updateOne: {
        filter: { orgId: ctx.orgId, connectionId: ctx.connectionId, resendId: item.resendId },
        update: { $set: { ...item.set, syncedAt: ctx.stamp } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

/** A plain list stage: one page of `list`, optionally enriched per item with a `get`. */
function listStage<S extends { id: string }, D>(config: {
  key: string;
  topic: MirrorKind;
  model: RefModel;
  pageSize: number;
  list: (ctx: StageContext, options: { limit: number; after?: string }) => Promise<Page<S>>;
  /** Extra call per item (e.g. records, html). Runs with limited concurrency. */
  detail?: (ctx: StageContext, item: S) => Promise<D>;
  toDoc: (ctx: StageContext, item: S, detail: D | undefined) => Record<string, unknown>;
  /** Called once per page with the page's items before upserting (dedupe, lookups). */
  prepare?: (ctx: StageContext, items: S[]) => Promise<void>;
  onRemoved?: StageDef["onRemoved"];
  onComplete?: StageDef["onComplete"];
}): StageDef {
  return {
    key: config.key,
    topic: config.topic,
    model: config.model,
    onRemoved: config.onRemoved,
    onComplete: config.onComplete,
    async run(ctx) {
      const page = await config.list(ctx, {
        limit: config.pageSize,
        ...(ctx.cursor ? { after: ctx.cursor } : {}),
      });
      await config.prepare?.(ctx, page.data);
      const details = config.detail
        ? await mapLimit(page.data, 4, (item) => config.detail!(ctx, item))
        : [];
      await upsertMirrors(
        config.model,
        ctx,
        page.data.map((item, i) => ({
          resendId: item.id,
          set: config.toDoc(ctx, item, details[i]),
        })),
      );
      return { count: page.data.length, nextCursor: page.hasMore ? page.nextCursor : undefined };
    },
  };
}

/** `resendId -> _id` for a connection's mirrors, to turn Resend ids into references. */
async function idMap(model: RefModel, ctx: StageContext): Promise<Map<string, Types.ObjectId>> {
  const docs = await model
    .find({ orgId: ctx.orgId, connectionId: ctx.connectionId }, { resendId: 1 })
    .lean();
  return new Map(docs.map((d: { resendId: string; _id: Types.ObjectId }) => [d.resendId, d._id]));
}

const BROADCAST_STATUS: Record<string, string> = {
  draft: "draft",
  queued: "queued",
  sending: "sending",
  sent: "sent",
  canceled: "canceled",
  cancelled: "canceled",
  failed: "failed",
  scheduled: "scheduled",
};

const domainsStage = listStage({
  key: "domains",
  topic: "domains",
  model: DomainModel,
  pageSize: 20,
  list: (ctx, o) => ctx.call(() => ctx.adapter.listDomains(o)),
  detail: (ctx, d) => ctx.call(() => ctx.adapter.getDomain(d.id)),
  toDoc: (_ctx, d, detail) => {
    const records = detail?.records ?? [];
    const receiving = records.filter((r) => r.record === "Receiving");
    return {
      name: d.name,
      status: d.status,
      region: d.region,
      openTracking: !!(detail ?? d).openTracking,
      clickTracking: !!(detail ?? d).clickTracking,
      receiving: {
        enabled: !!(detail ?? d).capabilities?.receiving,
        mxVerified: receiving.length > 0 && receiving.every((r) => r.status === "verified"),
      },
      records: records.map((r) => ({
        record: r.record,
        type: r.type,
        name: r.name,
        value: r.value,
        ...(r.priority === undefined ? {} : { priority: r.priority }),
        status: r.status,
      })),
      resendCreatedAt: date(d.createdAt),
    };
  },
  onRemoved: async (ctx, ids, session) => {
    await ApiKeyModel.updateMany(
      { orgId: ctx.orgId, connectionId: ctx.connectionId, domainId: { $in: ids } },
      { $set: { domainId: null } },
      { session },
    );
  },
  // Sender status follows its domain (DBD §4.3): recompute after every complete domain pass.
  onComplete: async (ctx, session) => {
    await recomputeSenderStatuses(ctx.orgId, { connectionId: ctx.connectionId }, { session });
  },
});

const apiKeysStage = listStage({
  key: "api_keys",
  topic: "api_keys",
  model: ApiKeyModel,
  pageSize: 100,
  list: (ctx, o) => ctx.call(() => ctx.adapter.listApiKeys(o)),
  toDoc: (_ctx, k) => ({
    name: k.name,
    resendCreatedAt: date(k.createdAt),
    lastUsedAt: date(k.lastUsedAt) ?? null,
  }),
});

const segmentsStage = listStage({
  key: "segments",
  topic: "segments",
  model: SegmentModel,
  pageSize: 100,
  list: (ctx, o) => ctx.call(() => ctx.adapter.listSegments(o)),
  toDoc: (_ctx, s) => ({ name: s.name, resendCreatedAt: date(s.createdAt) }),
  onRemoved: async (ctx, ids, session) => {
    await ContactModel.updateMany(
      { orgId: ctx.orgId, connectionId: ctx.connectionId, segmentIds: { $in: ids } },
      { $pullAll: { segmentIds: ids } },
      { session },
    );
    await BroadcastModel.updateMany(
      { orgId: ctx.orgId, connectionId: ctx.connectionId, segmentId: { $in: ids } },
      { $set: { segmentId: null } },
      { session },
    );
  },
});

const topicsStage = listStage({
  key: "topics",
  topic: "topics",
  model: TopicModel,
  pageSize: 100,
  list: (ctx) => ctx.call(() => ctx.adapter.listTopics()),
  toDoc: (_ctx, t) => ({
    name: t.name,
    description: t.description ?? undefined,
    defaultSubscription: t.defaultSubscription,
    resendCreatedAt: date(t.createdAt),
  }),
  onRemoved: async (ctx, ids, session) => {
    await ContactModel.updateMany(
      {
        orgId: ctx.orgId,
        connectionId: ctx.connectionId,
        "topicSubscriptions.topicId": { $in: ids },
      },
      { $pull: { topicSubscriptions: { topicId: { $in: ids } } } },
      { session },
    );
    await BroadcastModel.updateMany(
      { orgId: ctx.orgId, connectionId: ctx.connectionId, topicId: { $in: ids } },
      { $set: { topicId: null } },
      { session },
    );
  },
});

const contactPropertiesStage = listStage({
  key: "contact_properties",
  topic: "contact_properties",
  model: ContactPropertyModel,
  pageSize: 100,
  list: (ctx, o) => ctx.call(() => ctx.adapter.listContactProperties(o)),
  toDoc: (_ctx, p) => ({
    key: p.key,
    type: p.type,
    fallbackValue: p.fallbackValue,
    resendCreatedAt: date(p.createdAt),
  }),
});

const templatesStage = listStage({
  key: "templates",
  topic: "templates",
  model: TemplateModel,
  pageSize: 20,
  list: (ctx, o) => ctx.call(() => ctx.adapter.listTemplates(o)),
  detail: (ctx, t) => ctx.call(() => ctx.adapter.getTemplate(t.id)),
  toDoc: (_ctx, t, detail) => ({
    name: t.name,
    alias: t.alias ?? undefined,
    status: t.status,
    subject: detail?.subject ?? undefined,
    from: detail?.from ?? undefined,
    html: detail?.html,
    text: detail?.text ?? undefined,
    variables: (detail?.variables ?? []).map((v) => ({
      key: v.key,
      type: v.type,
      fallback: v.fallbackValue ?? undefined,
    })),
    resendCreatedAt: date(t.createdAt),
    resendUpdatedAt: date(t.updatedAt),
  }),
});

/**
 * Contacts: the list has no custom properties or topic subscriptions, so each contact is read
 * once more (`contacts.get`, and `contacts.topics.list` when the account has topics). That is
 * 2 extra calls per contact, hence the small page.
 */
const topicIdsForPage = new WeakMap<StageContext, Map<string, Types.ObjectId>>();
const contactsStage = listStage({
  key: "contacts",
  topic: "contacts",
  model: ContactModel,
  pageSize: 25,
  list: (ctx, o) => ctx.call(() => ctx.adapter.listContacts(o)),
  prepare: async (ctx, items) => {
    topicIdsForPage.set(ctx, await idMap(TopicModel, ctx));
    // A contact deleted and re-created in Resend has a new id but the same address; drop the
    // stale mirror first so the (connectionId, email) unique index cannot reject the upsert.
    await ContactModel.deleteMany({
      orgId: ctx.orgId,
      connectionId: ctx.connectionId,
      email: { $in: items.map((c) => c.email.toLowerCase()) },
      resendId: { $nin: items.map((c) => c.id) },
    });
  },
  detail: async (ctx, c) => {
    const detail = await ctx.call(() => ctx.adapter.getContact(c.id));
    const topics = topicIdsForPage.get(ctx);
    const subscriptions =
      topics && topics.size > 0
        ? (await ctx.call(() => ctx.adapter.listContactTopics(c.id, { limit: 100 }))).data
        : [];
    return { detail, subscriptions };
  },
  toDoc: (ctx, c, extra) => {
    const topics = topicIdsForPage.get(ctx) ?? new Map<string, Types.ObjectId>();
    return {
      email: c.email.toLowerCase(),
      firstName: c.firstName ?? undefined,
      lastName: c.lastName ?? undefined,
      unsubscribed: c.unsubscribed,
      properties: extra?.detail.properties ?? {},
      topicSubscriptions: (extra?.subscriptions ?? []).flatMap((s) => {
        const topicId = topics.get(s.id);
        return topicId ? [{ topicId, subscription: s.subscription }] : [];
      }),
      resendCreatedAt: date(c.createdAt),
    };
  },
});

/**
 * Segment membership. Resend's contact list can be filtered by segment, so this walks each
 * segment's contacts instead of asking every contact for its segments. Cursor:
 * `<segment resendId>|<after>`. Membership is rebuilt from scratch at the stage start.
 */
const contactSegmentsStage: StageDef = {
  key: "contact_segments",
  topic: "contacts",
  model: null,
  async run(ctx) {
    const segments = await SegmentModel.find(
      { orgId: ctx.orgId, connectionId: ctx.connectionId },
      { resendId: 1 },
    )
      .sort({ resendId: 1 })
      .lean();

    let segmentIndex = 0;
    let after: string | undefined;
    if (ctx.cursor === undefined) {
      await ContactModel.updateMany(
        { orgId: ctx.orgId, connectionId: ctx.connectionId },
        { $set: { segmentIds: [] } },
      );
    } else {
      const [resendId = "", cursorAfter = ""] = ctx.cursor.split("|");
      segmentIndex = segments.findIndex((s) => s.resendId === resendId);
      if (segmentIndex === -1) return { count: 0 }; // the segment vanished since; nothing to do
      after = cursorAfter || undefined;
    }
    const segment = segments[segmentIndex];
    if (!segment) return { count: 0 };

    const page = await ctx.call(() =>
      ctx.adapter.listContacts({
        segmentId: segment.resendId,
        limit: 100,
        ...(after ? { after } : {}),
      }),
    );
    if (page.data.length > 0) {
      await ContactModel.updateMany(
        {
          orgId: ctx.orgId,
          connectionId: ctx.connectionId,
          resendId: { $in: page.data.map((c) => c.id) },
        },
        { $addToSet: { segmentIds: segment._id } },
      );
    }
    if (page.hasMore && page.nextCursor) {
      return { count: page.data.length, nextCursor: `${segment.resendId}|${page.nextCursor}` };
    }
    const next = segments[segmentIndex + 1];
    return { count: page.data.length, nextCursor: next ? `${next.resendId}|` : undefined };
  },
  async onComplete(ctx, session) {
    const counts = await ContactModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { orgId: ctx.orgId, connectionId: ctx.connectionId } },
      { $unwind: "$segmentIds" },
      { $group: { _id: "$segmentIds", n: { $sum: 1 } } },
    ]).session(session);
    const byId = new Map(counts.map((c) => [c._id.toHexString(), c.n]));
    const segments = await SegmentModel.find(
      { orgId: ctx.orgId, connectionId: ctx.connectionId },
      { _id: 1 },
      { session },
    ).lean();
    if (segments.length === 0) return;
    await SegmentModel.bulkWrite(
      segments.map((s) => ({
        updateOne: {
          filter: { _id: s._id, orgId: ctx.orgId },
          update: { $set: { contactCount: byId.get(s._id.toHexString()) ?? 0 } },
        },
      })),
      { session },
    );
  },
};

const refsForPage = new WeakMap<
  StageContext,
  { segments: Map<string, Types.ObjectId>; topics: Map<string, Types.ObjectId> }
>();
const broadcastsStage = listStage({
  key: "broadcasts",
  topic: "broadcasts",
  model: BroadcastModel,
  pageSize: 20,
  list: (ctx, o) => ctx.call(() => ctx.adapter.listBroadcasts(o)),
  detail: (ctx, b) => ctx.call(() => ctx.adapter.getBroadcast(b.id)),
  prepare: async (ctx) => {
    refsForPage.set(ctx, {
      segments: await idMap(SegmentModel, ctx),
      topics: await idMap(TopicModel, ctx),
    });
  },
  toDoc: (ctx, b, detail) => {
    const refs = refsForPage.get(ctx);
    const scheduledAt = date(b.scheduledAt);
    let status = BROADCAST_STATUS[b.status] ?? "draft";
    if (status === "queued" && scheduledAt && scheduledAt.getTime() > Date.now()) {
      status = "scheduled";
    }
    return {
      name: b.name,
      status,
      segmentId: (b.segmentId && refs?.segments.get(b.segmentId)) || null,
      topicId: (detail?.topicId && refs?.topics.get(detail.topicId)) || null,
      from: detail?.from ?? undefined,
      subject: detail?.subject ?? undefined,
      previewText: detail?.previewText ?? undefined,
      html: detail?.html ?? undefined,
      text: detail?.text ?? undefined,
      scheduledAt: scheduledAt ?? null,
      sentAt: date(b.sentAt) ?? null,
      resendCreatedAt: date(b.createdAt),
    };
  },
});

const automationsStage = listStage({
  key: "automations",
  topic: "automations",
  model: AutomationModel,
  pageSize: 20,
  list: (ctx, o) => ctx.call(() => ctx.adapter.listAutomations(o)),
  detail: (ctx, a) => ctx.call(() => ctx.adapter.getAutomation(a.id)),
  toDoc: (_ctx, a, detail) => ({
    name: a.name,
    status: a.status,
    steps: detail?.steps ?? [],
    connections: detail?.connections ?? [],
    resendCreatedAt: date(a.createdAt),
    resendUpdatedAt: date(a.updatedAt),
  }),
});

/**
 * TODO(phase 4): sent and received email backfill goes here, after automations (TRD §2.2.4):
 * page `emails.list` / `emails.receiving.list` with a cursor, skip ids that have a
 * `deletion_tombstones` record and anything older than the org's retention window. Push stage
 * definitions here and add their keys to `SYNC_STAGE_KEYS` in `lib/dto/sync.ts`; runs and the
 * Inngest loop need no other change.
 */
const EMAIL_STAGES: StageDef[] = [];

const STAGES: StageDef[] = [
  domainsStage,
  apiKeysStage,
  segmentsStage,
  topicsStage,
  contactPropertiesStage,
  templatesStage,
  contactsStage,
  contactSegmentsStage,
  broadcastsStage,
  automationsStage,
  ...EMAIL_STAGES,
];

export const SYNC_STAGE_ORDER = STAGES.map((s) => s.key);

const stageLabel = (key: string) => SYNC_STAGE_LABELS[key as SyncStageKey] ?? key;

/* ------------------------------------------------------------------------------------------ */
/* Runs                                                                                        */
/* ------------------------------------------------------------------------------------------ */

const RESUME_FAILED_WITHIN_MS = 60 * 60 * 1000;

/**
 * Finds the run to continue, or starts one. A `running` run is always continued (its worker may
 * have died); a recently `failed` run is continued from the stage that failed so a retry does
 * not redo finished stages; otherwise a fresh run begins. Returns null when the connection is
 * gone or disabled.
 */
export async function startOrResumeRun(input: {
  connectionId: string;
  trigger: SyncTrigger;
}): Promise<{ runId: string; resumed: boolean } | null> {
  await connectDb();
  if (!Types.ObjectId.isValid(input.connectionId)) return null;
  const connection = await ConnectionModel.findOne(
    { _id: input.connectionId, deletedAt: null },
    { orgId: 1, status: 1, apiKey: 1 },
  ).lean();
  if (!connection || connection.status === "disabled" || !connection.apiKey) return null;

  const latest = await SyncRunModel.findOne({ connectionId: connection._id })
    .sort({ startedAt: -1 })
    .exec();

  const missingStages = (run: SyncRunDoc) =>
    STAGES.filter((s) => !run.resources.some((r) => r.name === s.key)).map((s) => ({
      name: s.key,
      status: "pending" as const,
      count: 0,
      removed: 0,
    }));

  if (latest?.status === "running") {
    latest.resources.push(...missingStages(latest));
    latest.markModified("resources");
    await latest.save();
    return { runId: latest._id.toHexString(), resumed: true };
  }
  if (
    latest?.status === "failed" &&
    Date.now() - (latest.updatedAt?.getTime() ?? 0) < RESUME_FAILED_WITHIN_MS
  ) {
    latest.status = "running";
    latest.error = undefined;
    latest.finishedAt = undefined;
    for (const r of latest.resources) {
      if (r.status === "failed") {
        r.status = "pending";
        r.error = undefined;
      }
    }
    latest.resources.push(...missingStages(latest));
    latest.markModified("resources");
    await latest.save();
    return { runId: latest._id.toHexString(), resumed: true };
  }

  const run = await SyncRunModel.create({
    orgId: connection.orgId,
    connectionId: connection._id,
    trigger: input.trigger,
    status: "running",
    resources: STAGES.map((s) => ({ name: s.key, status: "pending", count: 0, removed: 0 })),
    startedAt: new Date(),
  });
  await publish({
    orgId: connection.orgId,
    topics: ["connections", `connection:${connection._id.toHexString()}`],
    patch: { sync: "running" },
  });
  return { runId: run._id.toHexString(), resumed: false };
}

export type PageOutcome =
  | { status: "progress"; stage: string; count: number }
  | { status: "done" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "failed"; error: string };

const RATE_LIMIT_DEFAULT_SECONDS = 2;

function plainError(error: ResendError, stage: string): string {
  switch (error.code) {
    case "resend_unauthorized":
      return "Resend no longer accepts this connection's API key. Create a new Full access key and reconnect.";
    case "resend_forbidden":
      return `Resend refused to list ${stageLabel(stage).toLowerCase()}. Check that the key still has full access.`;
    default:
      return `Resend returned an error while syncing ${stageLabel(stage).toLowerCase()}: ${error.message}`;
  }
}

/** Marks a run failed (and the stage that was running). Exported for the Inngest `onFailure`. */
export async function failSyncRun(runId: string, message: string, stage?: string) {
  await connectDb();
  const run = await SyncRunModel.findById(runId);
  if (!run || run.status !== "running") return;
  const key = stage ?? run.resources.find((r) => r.status !== "completed")?.name;
  run.status = "failed";
  run.error = message;
  run.finishedAt = new Date();
  if (key) {
    run.stage = key;
    const resource = run.resources.find((r) => r.name === key);
    if (resource) {
      resource.status = "failed";
      resource.error = message;
    }
  }
  await run.save();
  await publish({
    orgId: run.orgId,
    topics: ["connections", `connection:${run.connectionId.toHexString()}`],
    patch: { sync: "failed" },
  });
}

/** Fails the connection's `running` run, if any (Inngest `onFailure`: retries are used up). */
export async function failRunningSync(connectionId: string, message: string) {
  await connectDb();
  if (!Types.ObjectId.isValid(connectionId)) return;
  const run = await SyncRunModel.findOne({ connectionId, status: "running" }, { _id: 1 })
    .sort({ startedAt: -1 })
    .lean();
  if (run) await failSyncRun(run._id.toHexString(), message);
}

/** Whether Resend still has our webhook, for the checklist. Never throws. */
async function webhookRemoteStatus(
  connection: Pick<ConnectionDoc, "webhook">,
  ctx: Pick<StageContext, "adapter" | "call">,
): Promise<"ok" | "missing" | "unknown"> {
  const id = connection.webhook?.resendId;
  if (!id) return "missing";
  try {
    await ctx.call(() => ctx.adapter.getWebhook(id));
    return "ok";
  } catch (error) {
    return isResendError(error) && error.code === "resend_not_found" ? "missing" : "unknown";
  }
}

async function finalizeRun(
  run: SyncRunDoc,
  connection: ConnectionDoc,
  ctx: StageContext,
): Promise<PageOutcome> {
  const webhookRemote = await webhookRemoteStatus(connection, ctx);
  const finishedAt = new Date();
  await withTransaction(async (session) => {
    await SyncRunModel.updateOne(
      { _id: run._id, orgId: run.orgId },
      { $set: { status: "completed", finishedAt }, $unset: { stage: 1, error: 1 } },
      { session },
    );
    await ConnectionModel.updateOne(
      { _id: connection._id, orgId: connection.orgId },
      { $set: { lastSyncAt: finishedAt } },
      { session },
    );
    await publish(
      {
        orgId: run.orgId,
        topics: ["connections", `connection:${connection._id.toHexString()}`],
        patch: { sync: "completed", lastSyncAt: finishedAt.toISOString() },
      },
      { session },
    );
  });
  await recomputeChecklist(connection._id, { webhookRemote });
  return { status: "done" };
}

async function completeStage(
  run: SyncRunDoc,
  stage: StageDef,
  ctx: StageContext,
  count: number,
): Promise<void> {
  await withTransaction(async (session) => {
    let removed = 0;
    if (stage.model) {
      const stale = {
        orgId: ctx.orgId,
        connectionId: ctx.connectionId,
        syncedAt: { $lt: ctx.stamp },
      };
      const ids = (await stage.model.find(stale, { _id: 1 }, { session }).lean()).map(
        (d: { _id: Types.ObjectId }) => d._id,
      );
      if (ids.length > 0) {
        await stage.model.deleteMany({ ...stale, _id: { $in: ids } }, { session });
        await stage.onRemoved?.(ctx, ids, session);
        removed = ids.length;
      }
    }
    await stage.onComplete?.(ctx, session);
    await SyncRunModel.updateOne(
      { _id: run._id, orgId: run.orgId, "resources.name": stage.key },
      {
        $set: { "resources.$.status": "completed", stage: stage.key },
        $unset: { "resources.$.cursor": 1, "resources.$.error": 1 },
        $inc: { "resources.$.count": count, "resources.$.removed": removed },
      },
      { session },
    );
    if (stage.topic) {
      await publish(
        {
          orgId: ctx.orgId,
          topics: [stage.topic, `connection:${ctx.connectionId.toHexString()}`],
          patch: { synced: stage.key, removed },
        },
        { session },
      );
    }
  });
}

/**
 * Does one page of the run's current stage and saves the checkpoint. Call repeatedly (each call
 * in its own durable step) until `done` or `failed`. `rate_limited` means nothing was saved and
 * the same call should be repeated after `retryAfterSeconds`. Unexpected errors are thrown so
 * the caller's retry policy applies.
 */
export async function syncNextPage(
  runId: string,
  deps: { adapter?: ResendAdapter } = {},
): Promise<PageOutcome> {
  await connectDb();
  const run = await SyncRunModel.findById(runId);
  if (!run) return { status: "failed", error: "This sync no longer exists." };
  if (run.status === "completed") return { status: "done" };
  if (run.status === "failed") return { status: "failed", error: run.error ?? "Sync failed." };

  const connection = await ConnectionModel.findOne({
    _id: run.connectionId,
    orgId: run.orgId,
    deletedAt: null,
  });
  if (!connection || !connection.apiKey || connection.status === "disabled") {
    const error = "This connection is no longer available.";
    await failSyncRun(runId, error);
    return { status: "failed", error };
  }
  const adapter =
    deps.adapter ??
    getResendAdapter(decryptSecret(connection.apiKey, { aad: keyAad(connection._id) }));
  const base = {
    orgId: run.orgId,
    connectionId: run.connectionId,
    adapter,
    stamp: run.startedAt,
    call: makePacer(),
  };

  const resource = run.resources.find((r) => r.status !== "completed" && stageDef(r.name));
  if (!resource) return finalizeRun(run, connection, { ...base, cursor: undefined });

  const stage = stageDef(resource.name)!;
  const ctx: StageContext = { ...base, cursor: resource.cursor ?? undefined };

  let result: StageResult;
  try {
    result = await stage.run(ctx);
  } catch (error) {
    if (!isResendError(error)) throw error;
    if (error.code === "resend_rate_limited") {
      return {
        status: "rate_limited",
        retryAfterSeconds: error.details.retryAfterSeconds ?? RATE_LIMIT_DEFAULT_SECONDS,
      };
    }
    if (error.code === "resend_unknown") throw error; // 5xx or network: retry
    const message = plainError(error, stage.key);
    if (error.code === "resend_unauthorized") {
      const flipped = await ConnectionModel.updateOne(
        { _id: connection._id, orgId: connection.orgId, status: "active" },
        { $set: { status: "needs_attention", statusReason: "key_revoked" } },
      );
      if (flipped.modifiedCount > 0) {
        await notifyConnectionAttention({
          orgId: connection.orgId,
          connectionId: connection._id,
          name: connection.name,
          reason: "key_revoked",
        });
      }
      await recomputeSenderStatuses(connection.orgId, { connectionId: connection._id });
    }
    await failSyncRun(runId, message, stage.key);
    return { status: "failed", error: message };
  }

  if (result.nextCursor) {
    await SyncRunModel.updateOne(
      { _id: run._id, orgId: run.orgId, "resources.name": stage.key },
      {
        $set: {
          "resources.$.status": "running",
          "resources.$.cursor": result.nextCursor,
          stage: stage.key,
        },
        $inc: { "resources.$.count": result.count },
      },
    );
  } else {
    await completeStage(run, stage, ctx, result.count);
  }
  return { status: "progress", stage: stage.key, count: result.count };
}

function stageDef(key: string) {
  return STAGES.find((s) => s.key === key);
}

/* ------------------------------------------------------------------------------------------ */
/* Requesting and observing syncs                                                              */
/* ------------------------------------------------------------------------------------------ */

const inFlight = new Map<string, Promise<PageOutcome>>();

const MAX_INLINE_ATTEMPTS = 3;

/**
 * Runs a whole sync in this process: the development fallback for when no Inngest server is
 * running (see `shouldRunInline`). One run per connection at a time. It has no durable steps, so
 * a process restart mid-run is recovered by requesting the sync again (the run resumes).
 */
export function runSyncInline(input: {
  connectionId: string;
  trigger: SyncTrigger;
  adapter?: ResendAdapter;
}): Promise<PageOutcome> {
  const existing = inFlight.get(input.connectionId);
  if (existing) return existing;
  const promise = (async (): Promise<PageOutcome> => {
    const started = await startOrResumeRun(input);
    if (!started) return { status: "failed", error: "This connection can't be synced." };
    let failures = 0;
    for (;;) {
      try {
        const outcome = await syncNextPage(started.runId, { adapter: input.adapter });
        if (outcome.status === "done" || outcome.status === "failed") return outcome;
        if (outcome.status === "rate_limited") {
          await sleep(
            Math.min(outcome.retryAfterSeconds, 10) * (env.NODE_ENV === "test" ? 1 : 1000),
          );
        }
      } catch (error) {
        if (++failures >= MAX_INLINE_ATTEMPTS) {
          const message = "Something went wrong while syncing. Try again in a moment.";
          console.error("[sync] inline run failed", error);
          await failSyncRun(started.runId, message);
          return { status: "failed", error: message };
        }
        await sleep(500 * failures);
      }
    }
  })().finally(() => inFlight.delete(input.connectionId));
  inFlight.set(input.connectionId, promise);
  return promise;
}

/**
 * When to run a sync inline instead of through Inngest. Only in development-like setups
 * (`INNGEST_DEV`, never production) and only when the job could not be delivered because no
 * Inngest dev server is running. With a reachable server the job always goes there.
 */
export function shouldRunInline(input: {
  delivered: boolean;
  inngestDev: boolean;
  nodeEnv: string;
}): boolean {
  return !input.delivered && input.inngestDev && input.nodeEnv !== "production";
}

export type RequestSyncDeps = {
  enqueue?: typeof enqueueConnectionSync;
  inngestDev?: boolean;
  nodeEnv?: string;
  adapter?: ResendAdapter;
};

/**
 * Creates (or resumes) the run so the UI shows "syncing" at once, then hands it to Inngest. If
 * the job could not be delivered and we are in development, runs it inline in the background
 * (`done` resolves when that finishes; tests await it).
 */
export async function requestSync(
  input: { connectionId: string; orgId: string; trigger: SyncTrigger },
  deps: RequestSyncDeps = {},
): Promise<SyncRequestResult & { done?: Promise<PageOutcome> }> {
  const started = await startOrResumeRun(input);
  if (!started) throw new ServiceError("conflict", "This connection can't be synced right now.");
  const delivered = await (deps.enqueue ?? enqueueConnectionSync)({
    connectionId: input.connectionId,
    orgId: input.orgId,
    trigger: input.trigger,
  });
  if (
    shouldRunInline({
      delivered,
      inngestDev: deps.inngestDev ?? env.INNGEST_DEV,
      nodeEnv: deps.nodeEnv ?? env.NODE_ENV,
    })
  ) {
    const done = runSyncInline({
      connectionId: input.connectionId,
      trigger: input.trigger,
      adapter: deps.adapter,
    });
    done.catch((error) => console.error("[sync] inline run crashed", error));
    return { mode: "inline", done };
  }
  return { mode: "queued" };
}

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);

/** A run that has not written for this long is treated as stalled: "Sync now" restarts it. */
const STALLED_AFTER_MS = 2 * 60 * 1000;

/** "Sync now" (connection:update): starts or resumes a sync and returns immediately. */
export async function syncNow(
  ctx: OrgContext,
  input: { connectionId: string },
  deps: RequestSyncDeps = {},
): Promise<SyncRequestResult> {
  authorize(ctx, "connection:update");
  await connectDb();
  const connection = await ConnectionModel.findOne(
    { _id: input.connectionId, orgId: orgOid(ctx), deletedAt: null },
    { status: 1, apiKey: 1 },
  ).lean();
  if (!connection) throw new ServiceError("not_found", "We couldn't find that connection.");
  if (connection.status === "disabled" || !connection.apiKey) {
    throw new ServiceError("conflict", "This connection is disabled, so it can't sync.");
  }

  const running = await SyncRunModel.findOne(
    { connectionId: connection._id, orgId: orgOid(ctx), status: "running" },
    { updatedAt: 1 },
  ).lean();
  if (running && Date.now() - (running.updatedAt?.getTime() ?? 0) < STALLED_AFTER_MS) {
    return { mode: "already_running" };
  }

  await writeAuditLog({
    orgId: orgOid(ctx),
    actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
    action: "connection.sync_requested",
    target: { type: "connection", id: connection._id },
  });
  const { mode } = await requestSync(
    { connectionId: connection._id.toHexString(), orgId: ctx.org.id, trigger: "manual" },
    deps,
  );
  return { mode };
}

/* ------------------------------------------------------------------------------------------ */
/* Reading status                                                                              */
/* ------------------------------------------------------------------------------------------ */

export function toSyncStatusDTO(run: {
  _id: Types.ObjectId;
  status: "running" | "completed" | "failed";
  trigger: "initial" | "scheduled" | "manual";
  startedAt: Date;
  finishedAt?: Date | null;
  stage?: string | null;
  error?: string | null;
  resources: { name: string; status: string; count?: number | null }[];
}): SyncStatusDTO {
  const current =
    run.status === "completed"
      ? null
      : (run.resources.find((r) => r.status === "failed" || r.status === "running") ??
        run.resources.find((r) => r.status === "pending"));
  const key = run.stage ?? current?.name;
  return {
    runId: run._id.toHexString(),
    state: run.status,
    trigger: run.trigger,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    stage: run.status === "completed" || !key ? null : { key, label: stageLabel(key) },
    error: run.error ?? null,
    progress: run.resources.map((r) => ({
      key: r.name,
      label: stageLabel(r.name),
      status: r.status as SyncStatusDTO["progress"][number]["status"],
      count: r.count ?? 0,
    })),
  };
}

/** Latest sync run per connection, scoped to the org. */
export async function getLatestSyncStatuses(
  orgId: Types.ObjectId,
  connectionIds: Types.ObjectId[],
): Promise<Map<string, SyncStatusDTO>> {
  await connectDb();
  const result = new Map<string, SyncStatusDTO>();
  if (connectionIds.length === 0) return result;
  const runs = await SyncRunModel.aggregate<
    Parameters<typeof toSyncStatusDTO>[0] & { _id: Types.ObjectId; connectionId: Types.ObjectId }
  >([
    { $match: { orgId, connectionId: { $in: connectionIds } } },
    { $sort: { startedAt: -1 } },
    { $group: { _id: "$connectionId", run: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$run" } },
  ]);
  for (const run of runs) result.set(run.connectionId.toHexString(), toSyncStatusDTO(run));
  return result;
}
