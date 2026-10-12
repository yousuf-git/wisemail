import "server-only";

import { Types } from "mongoose";
import { z } from "zod";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import {
  CLEANUP_ACTIONS,
  CleanupRuleModel,
  type CleanupRule,
  type CleanupRuleDoc,
} from "@/lib/db/models/cleanup-rules";
import { EmailModel, TRASH_RETENTION_DAYS } from "@/lib/db/models/emails";
import { ThreadModel } from "@/lib/db/models/threads";
import { withTransaction } from "@/lib/db/transaction";
import type { CleanupPreviewDTO, CleanupRuleDTO } from "@/lib/dto/deletion";
import { publish } from "@/lib/realtime/publish";
import { writeAuditLog } from "@/lib/services/audit";
import { ServiceError } from "@/lib/services/errors";
import { projectFilter } from "@/lib/services/project-scope";
import { recomputeThreadCache } from "@/lib/services/threads";
import { purgeEmails } from "./purge";

/**
 * Cleanup rules (PRD §5.16, TRD §2.14, P1). A rule selects emails by sender, subject, tag, AI
 * category, direction, age and scope, and archives, trashes or permanently deletes them; the
 * hourly `cleanup-rules` job applies enabled rules that have an age. `block_sender` rules act on
 * arrival instead (`blockedSender`). Deleting needs `cleanupRule:manageDelete` (Owner and Admin),
 * both to create such a rule and to change or remove an existing one.
 */

const DAY = 86_400_000;
const MAX_BATCHES_PER_RUN = 20;
const BATCH = 500;

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");
const trimmed = (max: number) => z.string().trim().min(1).max(max);
const address = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a full email address");
const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a domain such as example.com");

export const cleanupRuleInput = z
  .object({
    name: trimmed(80),
    enabled: z.boolean().default(true),
    kind: z.enum(["rule", "block_sender"]).default("rule"),
    action: z.enum(CLEANUP_ACTIONS),
    scope: z
      .object({
        connectionIds: z.array(objectId).max(50).default([]),
        projectIds: z.array(objectId).max(50).default([]),
        mailboxAddresses: z.array(address).max(50).default([]),
      })
      .default({ connectionIds: [], projectIds: [], mailboxAddresses: [] }),
    match: z
      .object({
        direction: z.enum(["inbound", "outbound"]).optional(),
        fromAddress: address.optional(),
        fromDomain: domain.optional(),
        subjectContains: trimmed(120).optional(),
        tag: z.object({ name: trimmed(100), value: trimmed(256).optional() }).optional(),
        aiCategory: trimmed(60).optional(),
        olderThanDays: z.number().int().min(1).max(3650).optional(),
      })
      .default({}),
  })
  .superRefine((rule, ctx) => {
    const m = rule.match;
    if (rule.kind === "block_sender") {
      if (!m.fromAddress && !m.fromDomain) {
        ctx.addIssue({
          code: "custom",
          path: ["match", "fromAddress"],
          message: "Enter the address or domain to block.",
        });
      }
      if (rule.action !== "trash") {
        ctx.addIssue({
          code: "custom",
          path: ["action"],
          message: "Blocked senders go straight to Trash.",
        });
      }
      if (m.olderThanDays) {
        ctx.addIssue({
          code: "custom",
          path: ["match", "olderThanDays"],
          message: "Blocking applies on arrival, without an age.",
        });
      }
      return;
    }
    if (!m.olderThanDays) {
      ctx.addIssue({
        code: "custom",
        path: ["match", "olderThanDays"],
        message: "Set how old an email must be.",
      });
    }
  });
export type CleanupRuleInput = z.input<typeof cleanupRuleInput>;

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);
const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hex = (id: Types.ObjectId) => id.toHexString();

export function toRuleDTO(
  rule: CleanupRule & { _id: Types.ObjectId; createdAt: Date },
): CleanupRuleDTO {
  const m = rule.match ?? {};
  return {
    id: hex(rule._id),
    name: rule.name,
    enabled: rule.enabled,
    kind: rule.kind,
    action: rule.action,
    scope: {
      connectionIds: (rule.scope?.connectionIds ?? []).map(hex),
      projectIds: (rule.scope?.projectIds ?? []).map(hex),
      mailboxAddresses: rule.scope?.mailboxAddresses ?? [],
    },
    match: {
      ...(m.direction ? { direction: m.direction } : {}),
      ...(m.fromAddress ? { fromAddress: m.fromAddress } : {}),
      ...(m.fromDomain ? { fromDomain: m.fromDomain } : {}),
      ...(m.subjectContains ? { subjectContains: m.subjectContains } : {}),
      ...(m.tag?.name
        ? { tag: { name: m.tag.name, ...(m.tag.value ? { value: m.tag.value } : {}) } }
        : {}),
      ...(m.aiCategory ? { aiCategory: m.aiCategory } : {}),
      ...(m.olderThanDays ? { olderThanDays: m.olderThanDays } : {}),
    },
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    lastRunCount: rule.lastRunCount ?? 0,
    createdAt: rule.createdAt.toISOString(),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Matching                                                                                    */
/* ------------------------------------------------------------------------------------------ */

type RuleShape = Pick<CleanupRule, "scope" | "match">;

/**
 * The Mongo query of the emails a rule selects (never drafts or Trash). `projectScope` narrows it
 * further for a member's preview; the job passes null (rules are org-wide by design).
 */
export async function ruleQuery(
  orgId: Types.ObjectId,
  rule: RuleShape,
  options: { now?: Date; projectScope?: string[] | null } = {},
): Promise<Record<string, unknown>> {
  const now = options.now ?? new Date();
  const m = rule.match ?? {};
  const and: Record<string, unknown>[] = [];
  const query: Record<string, unknown> = {
    orgId,
    trashedAt: null,
    status: { $nin: ["draft", "scheduled", "queued"] },
    ...projectFilter({ projectScope: options.projectScope ?? null }),
  };
  if (m.olderThanDays) query.createdAt = { $lt: new Date(now.getTime() - m.olderThanDays * DAY) };
  if (m.direction) query.direction = m.direction;
  if (m.fromAddress) query["from.address"] = m.fromAddress.toLowerCase();
  if (m.fromDomain) {
    and.push({
      "from.address": { $regex: `@${escapeRegex(m.fromDomain.toLowerCase())}$`, $options: "i" },
    });
  }
  if (m.subjectContains) {
    and.push({ subject: { $regex: escapeRegex(m.subjectContains), $options: "i" } });
  }
  if (m.tag?.name) {
    query.tags = {
      $elemMatch: { name: m.tag.name, ...(m.tag.value ? { value: m.tag.value } : {}) },
    };
  }
  if (m.aiCategory) {
    const threadIds = await ThreadModel.distinct("_id", {
      orgId,
      $or: [{ aiCategory: m.aiCategory }, { "aiTriage.category": m.aiCategory }],
    });
    query.threadId = { $in: threadIds };
  }
  const scope = rule.scope;
  if (scope?.connectionIds?.length) query.connectionId = { $in: scope.connectionIds };
  if (scope?.projectIds?.length) {
    const allowed = query.projectId as { $in: Types.ObjectId[] } | undefined;
    const wanted = scope.projectIds;
    query.projectId = {
      $in: allowed ? wanted.filter((p) => allowed.$in.some((a) => a.equals(p))) : wanted,
    };
  }
  if (scope?.mailboxAddresses?.length) {
    const boxes = scope.mailboxAddresses.map((a) => a.toLowerCase());
    and.push({ $or: [{ recipientAddresses: { $in: boxes } }, { "from.address": { $in: boxes } }] });
  }
  if (and.length) query.$and = and;
  return query;
}

/** Dry run: how many emails the rule would act on right now. */
export async function countRuleMatches(
  orgId: Types.ObjectId,
  rule: RuleShape,
  options: { now?: Date; projectScope?: string[] | null } = {},
): Promise<number> {
  return EmailModel.countDocuments(await ruleQuery(orgId, rule, options));
}

/** True when this inbound sender is blocked by an enabled `block_sender` rule (on arrival). */
export async function blockedSender(
  orgId: Types.ObjectId,
  input: { fromAddress: string; connectionId?: Types.ObjectId | null; mailbox?: string | null },
): Promise<Types.ObjectId | null> {
  const from = input.fromAddress.trim().toLowerCase();
  const fromDomain = from.split("@")[1] ?? "";
  const rules = await CleanupRuleModel.find({ orgId, enabled: true, kind: "block_sender" }).lean();
  for (const rule of rules) {
    const m = rule.match ?? {};
    const sender =
      (m.fromAddress && m.fromAddress.toLowerCase() === from) ||
      (m.fromDomain && m.fromDomain.toLowerCase() === fromDomain);
    if (!sender) continue;
    const s = rule.scope;
    if (
      s?.connectionIds?.length &&
      (!input.connectionId || !s.connectionIds.some((c) => c.equals(input.connectionId!)))
    )
      continue;
    if (
      s?.mailboxAddresses?.length &&
      !(input.mailbox && s.mailboxAddresses.includes(input.mailbox.toLowerCase()))
    )
      continue;
    return rule._id;
  }
  return null;
}

/* ------------------------------------------------------------------------------------------ */
/* Applying                                                                                    */
/* ------------------------------------------------------------------------------------------ */

async function trashByRule(orgId: Types.ObjectId, ruleId: Types.ObjectId, ids: Types.ObjectId[]) {
  const now = new Date();
  await withTransaction(async (session) => {
    const emails = await EmailModel.find(
      { _id: { $in: ids }, orgId, trashedAt: null },
      { threadId: 1 },
      { session },
    ).lean();
    await EmailModel.updateMany(
      { _id: { $in: emails.map((e) => e._id) }, orgId },
      {
        $set: {
          trashedAt: now,
          trashedBy: null,
          trashedByRuleId: ruleId,
          purgeAt: new Date(now.getTime() + TRASH_RETENTION_DAYS * DAY),
        },
      },
      { session },
    );
    const threads = new Map(
      emails.filter((e) => e.threadId).map((e) => [hex(e.threadId!), e.threadId!]),
    );
    for (const threadId of threads.values())
      await recomputeThreadCache(orgId, threadId, { session });
    await publish(
      {
        orgId,
        topics: ["threads", "emails", ...[...threads.keys()].map((t) => `thread:${t}`)],
        patch: { trashed: true },
      },
      { session },
    );
  });
}

async function archiveByRule(orgId: Types.ObjectId, ids: Types.ObjectId[]): Promise<number> {
  const emails = await EmailModel.find(
    { _id: { $in: ids }, orgId, threadId: { $ne: null } },
    { threadId: 1 },
  ).lean();
  const threadIds = [...new Set(emails.map((e) => hex(e.threadId!)))].map(
    (h) => new Types.ObjectId(h),
  );
  const res = await ThreadModel.updateMany(
    { _id: { $in: threadIds }, orgId, archived: false, trashedAt: null },
    { $set: { archived: true } },
  );
  if (res.modifiedCount > 0)
    await publish({ orgId, topics: ["threads"], patch: { archived: true } });
  return res.modifiedCount;
}

/**
 * Applies one rule now and records `lastRunAt` / `lastRunCount`. Bounded per run; what is left
 * matches again next hour. Idempotent: trashed emails no longer match, archived threads are
 * skipped.
 */
export async function runCleanupRule(
  rule: Pick<CleanupRuleDoc, "_id" | "orgId" | "scope" | "match" | "action" | "kind">,
  now: Date = new Date(),
): Promise<{ affected: number }> {
  await connectDb();
  let affected = 0;
  const query = await ruleQuery(rule.orgId, rule, { now });
  const seen: Types.ObjectId[] = [];
  let after: Types.ObjectId | null = null;
  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
    const found: { _id: Types.ObjectId }[] = await EmailModel.find(
      after ? { $and: [query, { _id: { $gt: after } }] } : query,
      { _id: 1 },
    )
      .sort({ _id: 1 })
      .limit(BATCH)
      .lean();
    if (found.length === 0) break;
    after = found.at(-1)!._id;
    const ids = found.map((f) => f._id);
    seen.push(...ids);
    if (rule.action === "trash") {
      await trashByRule(rule.orgId, rule._id, ids);
      affected += ids.length;
    } else if (rule.action === "delete") {
      const result = await purgeEmails(rule.orgId, ids, { reason: "rule", deletedBy: null });
      affected += result.deleted;
    } else {
      affected += await archiveByRule(rule.orgId, ids);
    }
    if (found.length < BATCH) break;
  }
  await CleanupRuleModel.updateOne(
    { _id: rule._id },
    { $set: { lastRunAt: now, lastRunCount: affected } },
  );
  if (affected > 0 && rule.action !== "archive") {
    await writeAuditLog({
      orgId: rule.orgId,
      actor: { type: "system" },
      action: rule.action === "delete" ? "cleanup_rule.deleted_mail" : "cleanup_rule.trashed_mail",
      target: { type: "cleanup_rule", id: rule._id },
      changes: { after: { count: affected } },
    });
  }
  return { affected };
}

/** Enabled age-based rules, for the hourly job (one job step per rule). */
export async function listRunnableRuleIds(): Promise<string[]> {
  await connectDb();
  const rules = await CleanupRuleModel.find(
    { enabled: true, kind: "rule", "match.olderThanDays": { $gt: 0 } },
    { _id: 1 },
  ).lean();
  return rules.map((r) => hex(r._id));
}

export async function runCleanupRuleById(ruleId: string, now: Date = new Date()) {
  await connectDb();
  const rule = await CleanupRuleModel.findById(ruleId);
  if (!rule || !rule.enabled) return { affected: 0 };
  return runCleanupRule(rule, now);
}

/* ------------------------------------------------------------------------------------------ */
/* CRUD (Settings → Cleanup)                                                                   */
/* ------------------------------------------------------------------------------------------ */

function authorizeAction(ctx: OrgContext, action: string) {
  authorize(ctx, "cleanupRule:manage");
  if (action === "delete") authorize(ctx, "cleanupRule:manageDelete");
}

export async function listCleanupRules(ctx: OrgContext): Promise<CleanupRuleDTO[]> {
  authorize(ctx, "cleanupRule:manage");
  await connectDb();
  const rules = await CleanupRuleModel.find({ orgId: orgOid(ctx) })
    .sort({ createdAt: -1 })
    .lean();
  return rules.map((r) => toRuleDTO(r as never));
}

export async function createCleanupRule(
  ctx: OrgContext,
  raw: CleanupRuleInput,
): Promise<CleanupRuleDTO> {
  const input = cleanupRuleInput.parse(raw);
  authorizeAction(ctx, input.action);
  await connectDb();
  const orgId = orgOid(ctx);
  return withTransaction(async (session) => {
    const [rule] = await CleanupRuleModel.create(
      [{ ...ruleDoc(input), orgId, createdBy: new Types.ObjectId(ctx.user.id) }],
      { session },
    );
    await writeAuditLog(
      {
        orgId,
        actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
        action: "cleanup_rule.created",
        target: { type: "cleanup_rule", id: rule!._id },
        changes: {
          after: {
            name: input.name,
            action: input.action,
            kind: input.kind,
            enabled: input.enabled,
          },
        },
      },
      { session },
    );
    return toRuleDTO(rule!.toObject() as never);
  });
}

export async function updateCleanupRule(
  ctx: OrgContext,
  ruleId: string,
  raw: CleanupRuleInput,
): Promise<CleanupRuleDTO> {
  const input = cleanupRuleInput.parse(raw);
  authorizeAction(ctx, input.action);
  await connectDb();
  const orgId = orgOid(ctx);
  const existing = await findRule(orgId, ruleId);
  // Editing a rule that deletes needs the same permission as creating one.
  authorizeAction(ctx, existing.action);
  return withTransaction(async (session) => {
    const before = { name: existing.name, action: existing.action, enabled: existing.enabled };
    const updated = await CleanupRuleModel.findOneAndUpdate(
      { _id: existing._id, orgId },
      { $set: ruleDoc(input) },
      { returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId,
        actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
        action: "cleanup_rule.updated",
        target: { type: "cleanup_rule", id: existing._id },
        changes: {
          before,
          after: { name: input.name, action: input.action, enabled: input.enabled },
        },
      },
      { session },
    );
    return toRuleDTO(updated!.toObject() as never);
  });
}

export async function setCleanupRuleEnabled(
  ctx: OrgContext,
  ruleId: string,
  enabled: boolean,
): Promise<CleanupRuleDTO> {
  authorize(ctx, "cleanupRule:manage");
  await connectDb();
  const orgId = orgOid(ctx);
  const existing = await findRule(orgId, ruleId);
  authorizeAction(ctx, existing.action);
  const updated = await CleanupRuleModel.findOneAndUpdate(
    { _id: existing._id, orgId },
    { $set: { enabled } },
    { returnDocument: "after" },
  );
  await writeAuditLog({
    orgId,
    actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
    action: enabled ? "cleanup_rule.enabled" : "cleanup_rule.disabled",
    target: { type: "cleanup_rule", id: existing._id },
  });
  return toRuleDTO(updated!.toObject() as never);
}

export async function deleteCleanupRule(ctx: OrgContext, ruleId: string): Promise<{ id: string }> {
  authorize(ctx, "cleanupRule:manage");
  await connectDb();
  const orgId = orgOid(ctx);
  const existing = await findRule(orgId, ruleId);
  authorizeAction(ctx, existing.action);
  await withTransaction(async (session) => {
    await CleanupRuleModel.deleteOne({ _id: existing._id, orgId }, { session });
    await writeAuditLog(
      {
        orgId,
        actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
        action: "cleanup_rule.deleted",
        target: { type: "cleanup_rule", id: existing._id },
        changes: { before: { name: existing.name, action: existing.action } },
      },
      { session },
    );
  });
  return { id: ruleId };
}

/** Dry run for the rule form: how many existing emails the conditions match right now. */
export async function previewCleanupRule(
  ctx: OrgContext,
  raw: CleanupRuleInput,
): Promise<CleanupPreviewDTO> {
  authorize(ctx, "cleanupRule:manage");
  const input = cleanupRuleInput.parse(raw);
  await connectDb();
  const shape = ruleDoc(input);
  // A block_sender rule is about future mail; the preview shows what the sender already sent.
  const count = await countRuleMatches(orgOid(ctx), shape, { projectScope: ctx.projectScope });
  return { count };
}

async function findRule(orgId: Types.ObjectId, ruleId: string) {
  if (!Types.ObjectId.isValid(ruleId)) throw new ServiceError("not_found", "Rule not found.");
  const rule = await CleanupRuleModel.findOne({ _id: ruleId, orgId });
  if (!rule) throw new ServiceError("not_found", "Rule not found.");
  return rule;
}

function ruleDoc(input: z.output<typeof cleanupRuleInput>) {
  return {
    name: input.name,
    enabled: input.enabled,
    kind: input.kind,
    action: input.action,
    scope: {
      connectionIds: input.scope.connectionIds.map((id) => new Types.ObjectId(id)),
      projectIds: input.scope.projectIds.map((id) => new Types.ObjectId(id)),
      mailboxAddresses: input.scope.mailboxAddresses,
    },
    match: input.match,
  };
}
