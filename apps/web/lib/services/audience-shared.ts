import "server-only";

import { Types } from "mongoose";
import { ZodError, type ZodType } from "zod";

import { authorize, type OrgContext } from "@/lib/dal";
import { decryptSecret } from "@/lib/crypto/envelope";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel, type ConnectionDoc } from "@/lib/db/models/connections";
import { DomainModel } from "@/lib/db/models/domains";
import type { ConnectionOptionDTO } from "@/lib/dto/audience";
import type { ResendAdapter } from "@/lib/resend/adapter";
import { getResendAdapter } from "@/lib/resend/client-factory";
import { isResendError } from "@/lib/resend/errors";
import { withRateLimitRetry } from "@/lib/resend/retry";
import { ServiceError } from "./errors";
import { keyAad } from "./webhook-secret";

/**
 * Shared plumbing for the Phase 6 write services (contacts, segments, topics, properties,
 * templates, broadcasts). Every write goes to Resend first through the adapter; only when Resend
 * accepts it does the service update the mirror, audit it and publish a realtime event, in one
 * transaction. A Resend failure therefore leaves the mirror untouched (TRD §2.12, PRD §5.16).
 */

export type AudienceDeps = { adapter?: ResendAdapter };

export const orgOid = (ctx: Pick<OrgContext, "org">) => new Types.ObjectId(ctx.org.id);

export function parseInput<T>(schema: ZodType<T>, raw: unknown): T {
  try {
    return schema.parse(raw);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      (fieldErrors[issue.path.join(".") || "_"] ??= []).push(issue.message);
    }
    throw new ServiceError("validation", "Some fields need another look.", fieldErrors);
  }
}

export function toObjectId(id: string, what: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new ServiceError("not_found", `${what} not found.`);
  return new Types.ObjectId(id);
}

/**
 * Connections a project-scoped member may see: the ones that own a domain in their projects.
 * `null` means unrestricted. (Audience objects carry no project of their own; they belong to a
 * connection, and a connection reaches a project through its domains.)
 */
export async function visibleConnectionIds(ctx: OrgContext): Promise<Types.ObjectId[] | null> {
  if (ctx.projectScope === null) return null;
  await connectDb();
  const ids = await DomainModel.distinct("connectionId", {
    orgId: orgOid(ctx),
    projectId: { $in: ctx.projectScope.map((id) => new Types.ObjectId(id)) },
  });
  return ids as Types.ObjectId[];
}

/** `{ orgId, connectionId? }` for reads, honoring project scope and an optional connection filter. */
export async function scopeFilter(
  ctx: OrgContext,
  connectionId?: string,
): Promise<{ orgId: Types.ObjectId; connectionId?: Types.ObjectId | { $in: Types.ObjectId[] } }> {
  const orgId = orgOid(ctx);
  const visible = await visibleConnectionIds(ctx);
  if (connectionId) {
    if (!Types.ObjectId.isValid(connectionId)) return { orgId, connectionId: { $in: [] } };
    const oid = new Types.ObjectId(connectionId);
    if (visible && !visible.some((v) => v.equals(oid))) return { orgId, connectionId: { $in: [] } };
    return { orgId, connectionId: oid };
  }
  return visible ? { orgId, connectionId: { $in: visible } } : { orgId };
}

export function connectionNote(status: string, reason?: string | null): string | null {
  if (status === "active") return null;
  if (status === "read_only") return "Read-only: this key can't change your audience.";
  if (reason === "key_revoked") return "Resend rejected this connection's key.";
  return "Needs attention: fix the connection in Settings first.";
}

/** Connections the member can see, with whether writes are possible on each. */
export async function listConnectionOptions(ctx: OrgContext): Promise<ConnectionOptionDTO[]> {
  await connectDb();
  const filter = await scopeFilter(ctx);
  const docs = await ConnectionModel.find(
    {
      orgId: filter.orgId,
      deletedAt: null,
      ...(filter.connectionId ? { _id: filter.connectionId } : {}),
    },
    { name: 1, status: 1, statusReason: 1 },
  )
    .sort({ createdAt: 1 })
    .lean();
  return docs.map((c) => ({
    id: c._id.toHexString(),
    name: c.name,
    writable: c.status === "active",
    note: connectionNote(c.status, c.statusReason),
  }));
}

/** Loads a connection the member can see. Writes also need it `active` (not read-only). */
export async function loadConnection(
  ctx: OrgContext,
  connectionId: string | Types.ObjectId,
  mode: "read" | "write",
  deps: AudienceDeps = {},
): Promise<{ connection: ConnectionDoc; adapter: ResendAdapter }> {
  await connectDb();
  const id =
    typeof connectionId === "string" ? toObjectId(connectionId, "Connection") : connectionId;
  const visible = await visibleConnectionIds(ctx);
  const connection = await ConnectionModel.findOne({
    _id: id,
    orgId: orgOid(ctx),
    deletedAt: null,
  });
  if (!connection || (visible && !visible.some((v) => v.equals(id)))) {
    throw new ServiceError("not_found", "We couldn't find that connection.");
  }
  if (mode === "write" && connection.status !== "active") {
    throw new ServiceError(
      connection.status === "read_only" ? "connection_read_only" : "connection_inactive",
      connection.status === "read_only"
        ? `${connection.name} is read-only, so it can't change your audience. Use a full-access key to edit.`
        : `${connection.name} needs attention before it can make changes. Check Settings, then Connections.`,
    );
  }
  if (deps.adapter) return { connection, adapter: deps.adapter };
  if (!connection.apiKey) {
    throw new ServiceError("connection_inactive", `${connection.name} has no API key.`);
  }
  const adapter = getResendAdapter(
    decryptSecret(connection.apiKey, { aad: keyAad(connection._id) }),
  );
  return { connection, adapter };
}

/** Runs one Resend call and turns its failures into `ServiceError`s people can read. */
export async function remote<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await withRateLimitRetry(fn, { attempts: 2, maxWaitMs: 2500 });
  } catch (error) {
    throw toServiceError(error);
  }
}

export function toServiceError(error: unknown): unknown {
  if (!isResendError(error)) return error;
  switch (error.code) {
    case "resend_rate_limited":
      return new ServiceError(
        "rate_limited",
        "Resend is asking us to slow down. Try again in a moment.",
      );
    case "resend_unauthorized":
      return new ServiceError("connection_inactive", "Resend rejected this connection's API key.");
    case "resend_not_found":
      return new ServiceError("resend_not_found", error.message);
    default:
      return new ServiceError("resend_rejected", error.message);
  }
}

export const isNotFoundInResend = (error: unknown) =>
  error instanceof ServiceError && error.code === "resend_not_found";

export { authorize };
