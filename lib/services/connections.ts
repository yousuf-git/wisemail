import "server-only";

import { Types, type ClientSession } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { assertLimitFor, getEntitlements } from "@/lib/billing/entitlements";
import { decryptSecret, encryptSecret, last4 } from "@/lib/crypto/envelope";
import { withTransaction } from "@/lib/db/transaction";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel, type ConnectionDoc } from "@/lib/db/models/connections";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { runConnectionDataToCompletion } from "@/lib/deletion/connection-data";
import { env } from "@/lib/env";
import { enqueueConnectionDataDelete } from "@/lib/jobs/send";
import type { ConnectionDTO, ConnectionQuota } from "@/lib/dto/connection";
import { publish } from "@/lib/realtime/publish";
import { isResendError, ResendError } from "@/lib/resend/errors";
import { getResendAdapter } from "@/lib/resend/client-factory";
import { SUPPORTED_EVENT_TYPES } from "@/lib/resend/events";
import { deriveTeamIdentity } from "@/lib/resend/fingerprint";
import type { ResendAdapter } from "@/lib/resend/adapter";
import type {
  AddConnectionInput,
  RemoveConnectionInput,
  RenameConnectionInput,
} from "@/lib/validation/connection";
import { recomputeSenderStatuses } from "./senders";
import { writeAuditLog } from "./audit";
import { toChecklistDTO } from "./checklist";
import { getLatestSyncStatuses, requestSync, shouldRunInline } from "./sync";
import { ServiceError } from "./errors";
import { keyAad, secretAad } from "./webhook-secret";
import { notifyConnectionAttention } from "./mail-notifications";

const isDuplicateKey = (error: unknown): error is { code: number; keyPattern?: object } =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

const SENDING_ONLY_MESSAGE =
  "This key can only send email. Create a Full access key in Resend → API Keys and paste it here.";
const REJECTED_MESSAGE =
  "Resend rejected this key. Create a Full access key in Resend → API Keys and paste it here.";

export const webhookUrl = (connectionId: Types.ObjectId | string) =>
  `${env.APP_URL.replace(/\/$/, "")}/api/ingest/resend/${connectionId.toString()}`;

export function toConnectionDTO(doc: {
  _id: Types.ObjectId;
  name: string;
  status: ConnectionDoc["status"];
  statusReason?: string | null;
  apiKeyLast4?: string | null;
  webhook?: { resendId?: string | null } | null;
  lastEventAt?: Date | null;
  lastSyncAt?: Date | null;
  checklist?: { key: string; status: "ok" | "warn" | "fail"; checkedAt: Date }[] | null;
  createdAt: Date;
}): ConnectionDTO {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    status: doc.status,
    statusReason: doc.statusReason ?? null,
    apiKeyLast4: doc.apiKeyLast4 ?? null,
    webhookRegistered: !!doc.webhook?.resendId,
    lastEventAt: doc.lastEventAt?.toISOString() ?? null,
    lastSyncAt: doc.lastSyncAt?.toISOString() ?? null,
    checklist: doc.checklist ? toChecklistDTO(doc.checklist) : null,
    sync: null,
    createdAt: doc.createdAt.toISOString(),
  };
}

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);
const userOid = (ctx: OrgContext) => new Types.ObjectId(ctx.user.id);
const live = { deletedAt: null } as const;

async function findLive(ctx: OrgContext, connectionId: string, session?: ClientSession) {
  const doc = await ConnectionModel.findOne(
    { _id: connectionId, orgId: orgOid(ctx), ...live },
    null,
    { session },
  );
  if (!doc) throw new ServiceError("not_found", "We couldn't find that connection.");
  return doc;
}

/** Turns a failed probe into the message the person should see. */
function keyProblem(error: unknown): ServiceError {
  if (isResendError(error)) {
    switch (error.code) {
      case "resend_forbidden":
        return new ServiceError("key_sending_only", SENDING_ONLY_MESSAGE, {
          apiKey: [SENDING_ONLY_MESSAGE],
        });
      case "resend_unauthorized":
        return new ServiceError("key_invalid", REJECTED_MESSAGE, { apiKey: [REJECTED_MESSAGE] });
      case "resend_rate_limited":
        return new ServiceError(
          "resend_rate_limited",
          "Resend is asking us to slow down. Try again in a few seconds.",
        );
    }
  }
  console.error("[connections] unexpected Resend error", error);
  return new ServiceError(
    "resend_unavailable",
    "We couldn't reach Resend to check this key. Try again in a moment.",
  );
}

/**
 * Registers our webhook in Resend and stores its id and (encrypted) signing secret. Outcomes:
 * active, or `needs_attention` with a reason (no free slot, key revoked, other failure). Runs
 * outside any transaction because it calls Resend; the resulting writes are one transaction.
 */
export async function registerWebhook(
  ctx: OrgContext,
  connection: ConnectionDoc,
  adapter: ResendAdapter,
): Promise<ConnectionDTO> {
  const events = [...SUPPORTED_EVENT_TYPES];
  let created: { id: string; signingSecret: string } | null = null;
  let failure: { reason: string; detail: string } | null = null;

  try {
    created = await adapter.createWebhook({ endpoint: webhookUrl(connection._id), events });
  } catch (error) {
    if (!isResendError(error)) throw error;
    failure =
      error.code === "resend_validation" || error.code === "resend_forbidden"
        ? { reason: "webhook_slot_unavailable", detail: error.message }
        : error.code === "resend_unauthorized"
          ? { reason: "key_revoked", detail: error.message }
          : { reason: "webhook_registration_failed", detail: error.message };
  }

  const now = new Date();
  await withTransaction(async (session) => {
    if (created) {
      await ConnectionModel.updateOne(
        { _id: connection._id, orgId: connection.orgId },
        {
          $set: {
            status: "active",
            webhook: {
              resendId: created.id,
              signingSecret: encryptSecret(created.signingSecret, {
                aad: secretAad(connection._id),
              }),
              events,
              registeredAt: now,
            },
          },
          $unset: { statusReason: 1 },
        },
        { session },
      );
    } else if (failure) {
      await ConnectionModel.updateOne(
        { _id: connection._id, orgId: connection.orgId },
        { $set: { status: "needs_attention", statusReason: failure.reason } },
        { session },
      );
      await notifyConnectionAttention(
        {
          orgId: connection.orgId,
          connectionId: connection._id,
          name: connection.name,
          reason: failure.reason,
        },
        { session },
      );
    }
    // Senders on this connection follow its status (DBD §4.3).
    await recomputeSenderStatuses(connection.orgId, { connectionId: connection._id }, { session });
    await writeAuditLog(
      {
        orgId: connection.orgId,
        actor: { type: "user", id: userOid(ctx) },
        action: created ? "connection.webhook_registered" : "connection.needs_attention",
        target: { type: "connection", id: connection._id },
        changes: {
          after: created
            ? { status: "active", webhookId: created.id, events: events.length }
            : { status: "needs_attention", statusReason: failure!.reason },
        },
      },
      { session },
    );
    await publish(
      {
        orgId: connection.orgId,
        topics: ["connections", `connection:${connection._id.toHexString()}`],
        patch: { status: created ? "active" : "needs_attention" },
      },
      { session },
    );
  });

  const fresh = await ConnectionModel.findById(connection._id).lean();
  return toConnectionDTO(fresh!);
}

async function afterActive(ctx: OrgContext, connection: ConnectionDTO) {
  if (connection.status !== "active") return;
  try {
    // Creates the run and hands it to Inngest; in development without an Inngest server it runs
    // in this process instead (see `requestSync`).
    await requestSync({ connectionId: connection.id, orgId: ctx.org.id, trigger: "initial" });
  } catch (error) {
    // The connection is usable; a manual sync can be requested later.
    console.error("[connections] could not enqueue initial sync", error);
  }
}

/**
 * TRD §2.2. Validate the key with a cheap full-access call, dedupe by Resend team, check the plan
 * limit, encrypt and save (`provisioning`), register our webhook, then `active` or
 * `needs_attention`, and enqueue the initial sync.
 */
export async function addConnection(
  ctx: OrgContext,
  input: AddConnectionInput,
): Promise<ConnectionDTO> {
  authorize(ctx, "connection:create");
  await connectDb();
  const orgId = orgOid(ctx);
  const name = input.name.trim();
  const apiKey = input.apiKey.trim();

  // Cheap, non-authoritative pre-checks so we don't call Resend for a doomed request.
  const entitlements = await getEntitlements(orgId);
  assertLimitFor(
    entitlements,
    "connections",
    await ConnectionModel.countDocuments({ orgId, ...live }),
  );
  if (await ConnectionModel.exists({ orgId, name, ...live })) {
    throw new ServiceError("conflict", "You already have a connection with that name.", {
      name: ["You already have a connection with that name."],
    });
  }

  const adapter = getResendAdapter(apiKey);

  let identity;
  try {
    await adapter.listDomains({ limit: 1 }); // full-access probe
    identity = await deriveTeamIdentity(adapter, orgId);
  } catch (error) {
    throw keyProblem(error);
  }

  const duplicate = await ConnectionModel.findOne(
    { orgId, resendTeamFingerprint: { $in: identity.candidates }, ...live },
    { name: 1 },
  ).lean();
  if (duplicate) {
    const message = `This Resend account is already connected as “${duplicate.name}”.`;
    throw new ServiceError("conflict", message, { apiKey: [message] });
  }

  const _id = new Types.ObjectId();
  let created: ConnectionDoc;
  try {
    created = await withTransaction(async (session) => {
      // Serialise concurrent adds in this org: both write the settings doc, so one transaction
      // conflicts, retries, and re-counts (UCD §5 "two members add connections near the limit").
      await OrgSettingsModel.updateOne(
        { orgId },
        { $currentDate: { updatedAt: true } },
        { session, timestamps: false },
      );
      {
        assertLimitFor(
          entitlements,
          "connections",
          await ConnectionModel.countDocuments({ orgId, ...live }, { session }),
        );
      }
      const [doc] = await ConnectionModel.create(
        [
          {
            _id,
            orgId,
            name,
            provider: "resend",
            apiKey: encryptSecret(apiKey, { aad: keyAad(_id) }),
            apiKeyLast4: last4(apiKey),
            resendTeamFingerprint: identity.fingerprint,
            status: "provisioning",
            createdBy: userOid(ctx),
            deletedAt: null,
          },
        ],
        { session },
      );
      await writeAuditLog(
        {
          orgId,
          actor: { type: "user", id: userOid(ctx) },
          action: "connection.created",
          target: { type: "connection", id: _id },
          changes: { after: { name, provider: "resend", apiKeyLast4: last4(apiKey) } },
        },
        { session },
      );
      await publish(
        { orgId, topics: ["connections", `connection:${_id.toHexString()}`] },
        { session },
      );
      return doc!;
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const byName = JSON.stringify((error as { keyPattern?: object }).keyPattern ?? {}).includes(
        '"name"',
      );
      throw byName
        ? new ServiceError("conflict", "You already have a connection with that name.", {
            name: ["You already have a connection with that name."],
          })
        : new ServiceError("conflict", "This Resend account is already connected.", {
            apiKey: ["This Resend account is already connected."],
          });
    }
    throw error;
  }

  const dto = await registerWebhook(ctx, created, adapter);
  await afterActive(ctx, dto);
  return dto;
}

/** Retry webhook registration for a connection that ended up in `needs_attention`. */
export async function retryConnectionSetup(
  ctx: OrgContext,
  input: { connectionId: string },
): Promise<ConnectionDTO> {
  authorize(ctx, "connection:update");
  await connectDb();
  const connection = await findLive(ctx, input.connectionId);
  if (connection.status !== "needs_attention" || connection.webhook?.resendId) {
    return toConnectionDTO(connection);
  }
  if (!connection.apiKey) throw new ServiceError("not_found", "We couldn't find that connection.");
  const apiKey = decryptSecret(connection.apiKey, { aad: keyAad(connection._id) });
  const adapter = getResendAdapter(apiKey);
  try {
    await adapter.listDomains({ limit: 1 });
  } catch (error) {
    if (isResendError(error) && error.code === "resend_unauthorized") {
      await ConnectionModel.updateOne(
        { _id: connection._id, orgId: connection.orgId },
        { $set: { statusReason: "key_revoked" } },
      );
    }
    throw keyProblem(error);
  }
  const dto = await registerWebhook(ctx, connection, adapter);
  await afterActive(ctx, dto);
  return dto;
}

export async function renameConnection(
  ctx: OrgContext,
  input: RenameConnectionInput,
): Promise<ConnectionDTO> {
  authorize(ctx, "connection:update");
  await connectDb();
  const name = input.name.trim();
  try {
    return await withTransaction(async (session) => {
      const connection = await findLive(ctx, input.connectionId, session);
      const before = connection.name;
      if (before === name) return toConnectionDTO(connection);
      connection.name = name;
      await connection.save({ session });
      await writeAuditLog(
        {
          orgId: connection.orgId,
          actor: { type: "user", id: userOid(ctx) },
          action: "connection.renamed",
          target: { type: "connection", id: connection._id },
          changes: { before: { name: before }, after: { name } },
        },
        { session },
      );
      await publish(
        {
          orgId: connection.orgId,
          topics: ["connections", `connection:${connection._id.toHexString()}`],
          patch: { name },
        },
        { session },
      );
      return toConnectionDTO(connection);
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new ServiceError("conflict", "You already have a connection with that name.", {
        name: ["You already have a connection with that name."],
      });
    }
    throw error;
  }
}

/**
 * UC-06 (remove): delete our webhook in Resend (best effort), soft-delete the connection, and
 * wipe its encrypted key material. The typed name must match.
 * By default synced data stays read-only (senders become `connection_inactive`); with
 * `deleteSyncedData` (typed `DELETE`) the `connection-data-delete` job erases the mirrors and mail
 * of this connection only (`lib/deletion/connection-data.ts`).
 */
export async function removeConnection(
  ctx: OrgContext,
  input: RemoveConnectionInput,
): Promise<{
  id: string;
  webhook: "deleted" | "already_gone" | "failed" | "none";
  /** `queued`: synced data is being deleted in the background; `kept`: left read-only. */
  data: "queued" | "kept";
}> {
  authorize(ctx, "connection:delete");
  await connectDb();
  const connection = await findLive(ctx, input.connectionId);
  if (input.confirmName.trim() !== connection.name) {
    throw new ServiceError("validation", "Type the connection's name to confirm.", {
      confirmName: ["That doesn't match the connection's name."],
    });
  }

  if (input.deleteSyncedData && input.confirmDelete?.trim() !== "DELETE") {
    throw new ServiceError("validation", "Type DELETE to erase the synced data.", {
      confirmDelete: ["Type DELETE to confirm."],
    });
  }

  let webhook: "deleted" | "already_gone" | "failed" | "none" = "none";
  if (connection.webhook?.resendId && connection.apiKey) {
    try {
      const apiKey = decryptSecret(connection.apiKey, { aad: keyAad(connection._id) });
      await getResendAdapter(apiKey).deleteWebhook(connection.webhook.resendId);
      webhook = "deleted";
    } catch (error) {
      webhook =
        error instanceof ResendError && error.code === "resend_not_found"
          ? "already_gone"
          : "failed";
      if (webhook === "failed")
        console.error("[connections] could not delete Resend webhook", error);
    }
  }

  await withTransaction(async (session) => {
    await ConnectionModel.updateOne(
      { _id: connection._id, orgId: connection.orgId },
      {
        $set: { deletedAt: new Date(), status: "disabled", statusReason: "removed" },
        // Wipe key material; the plain last4 stays for the audit trail.
        $unset: { apiKey: 1, webhook: 1 },
      },
      { session },
    );
    await recomputeSenderStatuses(connection.orgId, { connectionId: connection._id }, { session });
    await writeAuditLog(
      {
        orgId: connection.orgId,
        actor: { type: "user", id: userOid(ctx) },
        action: "connection.removed",
        target: { type: "connection", id: connection._id },
        changes: {
          before: { name: connection.name },
          after: { webhook, syncedData: input.deleteSyncedData ? "deleted" : "kept" },
        },
      },
      { session },
    );
    await publish(
      {
        orgId: connection.orgId,
        topics: ["connections", `connection:${connection._id.toHexString()}`],
        patch: { removed: true },
      },
      { session },
    );
  });

  if (input.deleteSyncedData) {
    const job = {
      connectionId: connection._id.toHexString(),
      orgId: connection.orgId.toHexString(),
      requestedBy: ctx.user.id,
    };
    const delivered = await enqueueConnectionDataDelete(job);
    // Development without an Inngest dev server: work through it in this process.
    if (shouldRunInline({ delivered, inngestDev: env.INNGEST_DEV, nodeEnv: env.NODE_ENV })) {
      void runConnectionDataToCompletion(job).catch((error) =>
        console.error("[connections] inline data deletion failed", error),
      );
    }
  }

  return {
    id: connection._id.toHexString(),
    webhook,
    data: input.deleteSyncedData ? "queued" : "kept",
  };
}

export async function listConnections(ctx: OrgContext): Promise<ConnectionDTO[]> {
  authorize(ctx, "connection:read");
  await connectDb();
  const docs = await ConnectionModel.find(
    { orgId: orgOid(ctx), ...live },
    {
      name: 1,
      status: 1,
      statusReason: 1,
      apiKeyLast4: 1,
      "webhook.resendId": 1,
      lastEventAt: 1,
      lastSyncAt: 1,
      checklist: 1,
      createdAt: 1,
    },
  )
    .sort({ createdAt: 1 })
    .lean();
  const syncs = await getLatestSyncStatuses(
    orgOid(ctx),
    docs.map((d) => d._id),
  );
  return docs.map((doc) => ({
    ...toConnectionDTO(doc),
    sync: syncs.get(doc._id.toHexString()) ?? null,
  }));
}

/** Connection usage against the plan, for the "N of M" line and the limit dialog. */
export async function getConnectionQuota(ctx: OrgContext): Promise<ConnectionQuota> {
  authorize(ctx, "connection:read");
  await connectDb();
  const orgId = orgOid(ctx);
  const [e, used] = await Promise.all([
    getEntitlements(orgId),
    ConnectionModel.countDocuments({ orgId, ...live }),
  ]);
  return {
    used,
    limit: e.limits.connections,
    planLabel: e.planLabel,
    nextTierLabel: e.nextTierLabel,
  };
}

export { readWebhookSigningSecret } from "./webhook-secret";
