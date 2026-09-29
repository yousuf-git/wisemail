import "server-only";

import { Types, type QueryFilter } from "mongoose";
import mongoose from "mongoose";

import { assertFeatureFor, getEntitlements } from "@/lib/billing/entitlements";
import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { AuditLogModel, type AuditLog } from "@/lib/db/models/audit-log";
import type { AuditEntryDTO, AuditFiltersDTO, AuditPageDTO } from "@/lib/dto/audit";
import type { AuditQuery } from "@/lib/validation/audit";
import { ServiceError } from "./errors";

/**
 * Reading the audit log (UCD UC-27): Owners and Admins (`auditLog:read`), Team and above
 * (`auditLog` feature), limited to the plan's window (90 days Team, 1 year Agency). Every query
 * is scoped by the verified org id; filters only narrow within it.
 */

const DAY = 86_400_000;
const DEFAULT_LIMIT = 50;
export const EXPORT_MAX_ROWS = 10_000;

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);

type Cursor = { t: number; id: string };

const encodeCursor = (c: Cursor) => Buffer.from(`${c.t}_${c.id}`).toString("base64url");
function decodeCursor(raw: string): Cursor {
  const [t, id] = Buffer.from(raw, "base64url").toString().split("_");
  if (!t || !id || !/^\d+$/.test(t) || !/^[0-9a-f]{24}$/i.test(id)) {
    throw new ServiceError("validation", "That page link is not valid.");
  }
  return { t: Number(t), id };
}

async function access(ctx: OrgContext) {
  authorize(ctx, "auditLog:read");
  await connectDb();
  const e = await getEntitlements(orgOid(ctx));
  assertFeatureFor(e, "auditLog");
  return e;
}

function buildFilter(ctx: OrgContext, windowDays: number, q: AuditQuery): QueryFilter<AuditLog> {
  const since = new Date(Date.now() - windowDays * DAY);
  const created: Record<string, Date> = { $gte: since };
  if (q.from) {
    const from = new Date(`${q.from}T00:00:00.000Z`);
    if (from > since) created.$gte = from;
  }
  if (q.to) created.$lt = new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + DAY);

  const filter: QueryFilter<AuditLog> = { orgId: orgOid(ctx), createdAt: created };
  if (q.actor === "system") filter.actorType = "system";
  else if (q.actor) filter.actorId = new Types.ObjectId(q.actor);
  if (q.action) {
    filter.action = q.action.endsWith(".")
      ? { $regex: `^${q.action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` }
      : q.action;
  }
  if (q.targetType) filter["target.type"] = q.targetType;
  return filter;
}

async function actorNames(ids: Types.ObjectId[]) {
  if (ids.length === 0) return new Map<string, string>();
  const users = await mongoose.connection
    .collection("user")
    .find({ _id: { $in: ids } }, { projection: { name: 1, email: 1 } })
    .toArray();
  return new Map(users.map((u) => [String(u._id), (u.name as string) || (u.email as string)]));
}

type Row = {
  _id: Types.ObjectId;
  createdAt: Date;
  actorType: "user" | "system";
  actorId?: Types.ObjectId | null;
  action: string;
  target: { type: string; id: unknown };
  changes?: { before?: unknown; after?: unknown } | null;
  ip?: string | null;
  userAgent?: string | null;
};

function toDTO(row: Row, names: Map<string, string>): AuditEntryDTO {
  const changes = row.changes && (row.changes.before || row.changes.after) ? row.changes : null;
  return {
    id: row._id.toHexString(),
    createdAt: row.createdAt.toISOString(),
    actor: {
      type: row.actorType,
      id: row.actorId ? String(row.actorId) : null,
      name:
        row.actorType === "system" ? "System" : (names.get(String(row.actorId)) ?? "Former member"),
    },
    action: row.action,
    target: { type: row.target.type, id: String(row.target.id) },
    changes: changes as AuditEntryDTO["changes"],
    ip: row.ip ?? null,
    userAgent: row.userAgent ?? null,
  };
}

async function fetchPage(
  ctx: OrgContext,
  windowDays: number,
  q: AuditQuery,
  limit: number,
): Promise<AuditPageDTO> {
  const filter = buildFilter(ctx, windowDays, q);
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    const at = new Date(c.t);
    const id = new Types.ObjectId(c.id);
    filter.$or = [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: id } }];
  }
  const rows = await AuditLogModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();
  const page = rows.slice(0, limit);
  const names = await actorNames(
    [...new Set(page.filter((r) => r.actorId).map((r) => String(r.actorId)))].map(
      (id) => new Types.ObjectId(id),
    ),
  );
  const last = page.at(-1);
  return {
    items: page.map((r) => toDTO(r as Row, names)),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ t: last.createdAt.getTime(), id: last._id.toHexString() })
        : null,
  };
}

/** One page of the audit log, newest first (cursor pagination). */
export async function listAuditLog(ctx: OrgContext, q: AuditQuery): Promise<AuditPageDTO> {
  const e = await access(ctx);
  return fetchPage(ctx, e.limits.auditLogDays, q, q.limit ?? DEFAULT_LIMIT);
}

/** Values for the filter controls (actions, resource types and actors seen in the window). */
export async function getAuditFilters(ctx: OrgContext): Promise<AuditFiltersDTO> {
  const e = await access(ctx);
  const scope = {
    orgId: orgOid(ctx),
    createdAt: { $gte: new Date(Date.now() - e.limits.auditLogDays * DAY) },
  };
  const [actions, targetTypes, actorIds] = await Promise.all([
    AuditLogModel.distinct("action", scope),
    AuditLogModel.distinct("target.type", scope),
    AuditLogModel.distinct("actorId", { ...scope, actorType: "user" }),
  ]);
  const names = await actorNames(actorIds as Types.ObjectId[]);
  return {
    actions: (actions as string[]).sort(),
    targetTypes: (targetTypes as string[]).sort(),
    actors: (actorIds as Types.ObjectId[])
      .map((id) => ({ id: String(id), name: names.get(String(id)) ?? "Former member" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    windowDays: e.limits.auditLogDays,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* CSV                                                                                         */
/* ------------------------------------------------------------------------------------------ */

/** Quotes a cell and neutralises spreadsheet formulas (`=`, `+`, `-`, `@`). */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportAuditCsv(ctx: OrgContext, q: AuditQuery): Promise<string> {
  const e = await access(ctx);
  const header = [
    "Time (UTC)",
    "Actor",
    "Actor type",
    "Action",
    "Resource",
    "Resource id",
    "Before",
    "After",
    "IP",
  ];
  const lines = [header.join(",")];
  let cursor: string | undefined;
  let count = 0;
  while (count < EXPORT_MAX_ROWS) {
    const page = await fetchPage(
      ctx,
      e.limits.auditLogDays,
      { ...q, cursor },
      Math.min(500, EXPORT_MAX_ROWS - count),
    );
    for (const r of page.items) {
      lines.push(
        [
          r.createdAt,
          r.actor.name,
          r.actor.type,
          r.action,
          r.target.type,
          r.target.id,
          r.changes?.before,
          r.changes?.after,
          r.ip,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    count += page.items.length;
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return `${lines.join("\r\n")}\r\n`;
}
