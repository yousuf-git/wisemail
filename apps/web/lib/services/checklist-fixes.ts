import "server-only";

import { Types } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { decryptSecret } from "@/lib/crypto/envelope";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel, type ConnectionDoc } from "@/lib/db/models/connections";
import { DomainModel } from "@/lib/db/models/domains";
import { withTransaction } from "@/lib/db/transaction";
import type { ChecklistItemDTO } from "@/lib/dto/checklist";
import { publish } from "@/lib/realtime/publish";
import type { ResendAdapter } from "@/lib/resend/adapter";
import { getResendAdapter } from "@/lib/resend/client-factory";
import { isResendError } from "@/lib/resend/errors";
import { withRateLimitRetry } from "@/lib/resend/retry";
import { writeAuditLog } from "./audit";
import { loadChecklistDomains, recomputeChecklist, toChecklistDTO } from "./checklist";
import { registerWebhook } from "./connections";
import { ServiceError } from "./errors";
import { keyAad } from "./webhook-secret";

/**
 * One-click fixes for checklist items where Resend's API allows them (PRD §5.1):
 * open/click tracking on every domain that has it off, and re-registering our webhook. Each
 * fix changes Resend first, then the mirror, then recomputes the checklist, so the UI never
 * shows a state Resend does not have. DNS and receiving cannot be fixed through the API.
 */

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);

async function loadConnection(ctx: OrgContext, connectionId: string): Promise<ConnectionDoc> {
  if (!Types.ObjectId.isValid(connectionId)) {
    throw new ServiceError("not_found", "We couldn't find that connection.");
  }
  const connection = await ConnectionModel.findOne({
    _id: connectionId,
    orgId: orgOid(ctx),
    deletedAt: null,
  });
  if (!connection || !connection.apiKey) {
    throw new ServiceError("not_found", "We couldn't find that connection.");
  }
  return connection;
}

function adapterFor(connection: ConnectionDoc): ResendAdapter {
  return getResendAdapter(decryptSecret(connection.apiKey!, { aad: keyAad(connection._id) }));
}

function assertManageable(connection: ConnectionDoc) {
  if (connection.status === "read_only" || connection.status === "disabled") {
    throw new ServiceError(
      "conflict",
      "This connection is read only, so Wisemail can't change anything in Resend for it.",
    );
  }
}

function resendProblem(error: unknown): never {
  if (isResendError(error)) {
    switch (error.code) {
      case "resend_rate_limited":
        throw new ServiceError(
          "resend_rate_limited",
          "Resend is asking us to slow down. Try again in a few seconds.",
        );
      case "resend_forbidden":
      case "resend_unauthorized":
        throw new ServiceError(
          "resend_forbidden",
          "Resend didn't allow that change. Check that this connection's key has full access.",
        );
    }
  }
  console.error("[checklist-fixes] unexpected Resend error", error);
  throw new ServiceError(
    "resend_unavailable",
    "We couldn't reach Resend to make that change. Try again in a moment.",
  );
}

async function freshChecklist(connection: ConnectionDoc): Promise<ChecklistItemDTO[]> {
  const stored = await ConnectionModel.findById(connection._id, { checklist: 1 }).lean();
  return toChecklistDTO(
    stored?.checklist,
    await loadChecklistDomains(connection.orgId, connection._id),
  );
}

export type TrackingFixResult = {
  /** Domain names now tracking. */
  updated: string[];
  /** Domains Resend no longer knows (the mirror is stale until the next sync). */
  missing: string[];
  checklist: ChecklistItemDTO[];
};

/** Turns open or click tracking on for every domain of the connection that has it off. */
export async function enableTracking(
  ctx: OrgContext,
  input: { connectionId: string; kind: "open" | "click" },
  deps: { adapter?: ResendAdapter } = {},
): Promise<TrackingFixResult> {
  authorize(ctx, "domain:update");
  await connectDb();
  const connection = await loadConnection(ctx, input.connectionId);
  assertManageable(connection);
  const adapter = deps.adapter ?? adapterFor(connection);
  const field = input.kind === "open" ? "openTracking" : "clickTracking";

  const domains = await DomainModel.find(
    { orgId: connection.orgId, connectionId: connection._id, [field]: { $ne: true } },
    { resendId: 1, name: 1 },
  ).lean();

  const updated: { _id: Types.ObjectId; name: string }[] = [];
  const missing: string[] = [];
  for (const domain of domains) {
    try {
      await withRateLimitRetry(() => adapter.updateDomain({ id: domain.resendId, [field]: true }));
      updated.push(domain);
    } catch (error) {
      if (isResendError(error) && error.code === "resend_not_found") {
        missing.push(domain.name);
        continue;
      }
      // Keep what already changed in Resend in step with the mirror before reporting.
      if (updated.length > 0) await mirrorTracking(connection, updated, field);
      resendProblem(error);
    }
  }

  await mirrorTracking(connection, updated, field);
  await withTransaction(async (session) => {
    await writeAuditLog(
      {
        orgId: connection.orgId,
        actor: { type: "user", id: new Types.ObjectId(ctx.user.id) },
        action: "domain.tracking_updated",
        target: { type: "connection", id: connection._id },
        changes: {
          after: { [field]: true, domains: updated.map((d) => d.name), missing },
        },
      },
      { session },
    );
  });
  await recomputeChecklist(connection._id);
  return {
    updated: updated.map((d) => d.name),
    missing,
    checklist: await freshChecklist(connection),
  };
}

async function mirrorTracking(
  connection: ConnectionDoc,
  domains: { _id: Types.ObjectId }[],
  field: "openTracking" | "clickTracking",
) {
  if (domains.length === 0) return;
  await DomainModel.updateMany(
    {
      _id: { $in: domains.map((d) => d._id) },
      orgId: connection.orgId,
      connectionId: connection._id,
    },
    { $set: { [field]: true } },
  );
  await publish({
    orgId: connection.orgId,
    topics: ["domains", `connection:${connection._id.toHexString()}`],
    patch: { [field]: true },
  });
}

export type WebhookFixResult = {
  registered: boolean;
  status: ConnectionDoc["status"];
  checklist: ChecklistItemDTO[];
};

/**
 * Re-registers our webhook: deletes the old one in Resend if it is still there (which also frees
 * its slot), creates a new one and stores its new signing secret.
 */
export async function reregisterWebhook(
  ctx: OrgContext,
  input: { connectionId: string },
  deps: { adapter?: ResendAdapter } = {},
): Promise<WebhookFixResult> {
  authorize(ctx, "connection:update");
  await connectDb();
  const connection = await loadConnection(ctx, input.connectionId);
  assertManageable(connection);
  const adapter = deps.adapter ?? adapterFor(connection);

  const oldId = connection.webhook?.resendId;
  if (oldId) {
    try {
      await withRateLimitRetry(() => adapter.deleteWebhook(oldId));
    } catch (error) {
      if (!isResendError(error) || error.code !== "resend_not_found") {
        if (isResendError(error) && error.code === "resend_rate_limited") resendProblem(error);
        // Could not remove it (e.g. permissions); try to register anyway.
        console.warn("[checklist-fixes] could not delete the old webhook", error);
      }
    }
  }

  const dto = await registerWebhook(ctx, connection, adapter);
  const registered = dto.webhookRegistered && dto.status === "active";
  if (!registered) {
    // The old webhook is gone and the new one failed: do not keep pointing at a dead id.
    await ConnectionModel.updateOne(
      { _id: connection._id, orgId: connection.orgId },
      { $unset: { webhook: 1 } },
    );
  }
  await recomputeChecklist(connection._id, { webhookRemote: registered ? "ok" : "missing" });
  return { registered, status: dto.status, checklist: await freshChecklist(connection) };
}
