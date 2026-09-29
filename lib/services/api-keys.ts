import "server-only";

import { Types } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ApiKeyModel } from "@/lib/db/models/api-keys";
import { ConnectionModel, type ConnectionDoc } from "@/lib/db/models/connections";
import { DomainModel } from "@/lib/db/models/domains";
import { withTransaction } from "@/lib/db/transaction";
import type { ApiKeyDTO, CreatedApiKeyDTO } from "@/lib/dto/domain";
import { publish } from "@/lib/realtime/publish";
import type { ResendAdapter } from "@/lib/resend/adapter";
import { isResendError } from "@/lib/resend/errors";
import { withRateLimitRetry } from "@/lib/resend/retry";
import {
  API_KEY_STALE_DAYS,
  createApiKeySchema,
  deleteApiKeySchema,
  type CreateApiKeyFormInput,
} from "@/lib/validation/domain";
import { writeAuditLog } from "./audit";
import { ServiceError } from "./errors";
import { canSeeProject, projectFilter } from "./project-scope";
import {
  adapterFor,
  assertManageable,
  loadLiveConnection,
  orgOid,
  resendProblem,
  userOid,
} from "./resend-access";

/**
 * API keys across connections (PRD §5.8, UCD UC-21). The list is Resend's metadata mirror: never
 * a key. A key's secret exists only in the response of `createApiKey`, which hands it to the
 * caller once; it is not stored, logged, audited or published anywhere.
 */

type Deps = { adapter?: ResendAdapter; now?: Date };

const DAY_MS = 86_400_000;

type KeyDoc = {
  _id: Types.ObjectId;
  connectionId: Types.ObjectId;
  resendId: string;
  name: string;
  permission?: "full_access" | "sending_access" | null;
  domainId?: Types.ObjectId | null;
  resendCreatedAt?: Date | null;
  lastUsedAt?: Date | null;
  createdViaApp?: boolean | null;
};

/** Whether a mirrored key is the one Wisemail authenticates with (see `ApiKeyDTO.inUse`). */
export function keyInUse(
  key: Pick<KeyDoc, "resendId" | "name" | "createdViaApp">,
  ownKeyId: string | null,
): "exact" | "possible" | null {
  if (ownKeyId && key.resendId === ownKeyId) return "exact";
  // Live Resend doesn't say which key a request used; a key named after us that we didn't create
  // is very likely the one that was pasted in.
  if (!ownKeyId && !key.createdViaApp && /wisemail/i.test(key.name)) return "possible";
  return null;
}

function toDTO(
  key: KeyDoc,
  extra: {
    connectionName: string;
    connectionKeyLast4: string | null;
    ownKeyId: string | null;
    domainName: string | null;
    now: Date;
  },
): ApiKeyDTO {
  const created = key.resendCreatedAt ?? null;
  return {
    id: key._id.toHexString(),
    connectionId: key.connectionId.toHexString(),
    connectionName: extra.connectionName,
    name: key.name,
    permission: key.permission ?? null,
    domainId: key.domainId?.toHexString() ?? null,
    domainName: extra.domainName,
    createdAt: created?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdViaApp: !!key.createdViaApp,
    inUse: keyInUse(key, extra.ownKeyId),
    connectionKeyLast4: extra.connectionKeyLast4,
    stale:
      key.permission === "full_access" &&
      !!created &&
      extra.now.getTime() - created.getTime() > API_KEY_STALE_DAYS * DAY_MS,
  };
}

function ownKeyIdOf(connection: ConnectionDoc | { apiKey?: unknown }): string | null {
  try {
    return adapterFor(connection as ConnectionDoc).ownApiKeyId();
  } catch {
    return null;
  }
}

/** Keys the member may see. Scoped members only see keys limited to a domain of their projects. */
export async function listApiKeys(ctx: OrgContext, deps: Deps = {}): Promise<ApiKeyDTO[]> {
  authorize(ctx, "apiKey:read");
  await connectDb();
  const orgId = orgOid(ctx);
  const keys = await ApiKeyModel.find({ orgId }).sort({ resendCreatedAt: -1, _id: -1 }).lean();
  if (keys.length === 0) return [];

  const [connections, domains] = await Promise.all([
    ConnectionModel.find({ orgId, deletedAt: null }).lean(),
    DomainModel.find({ orgId, ...projectFilter(ctx) }, { name: 1, projectId: 1 }).lean(),
  ]);
  const connectionById = new Map(connections.map((c) => [c._id.toHexString(), c]));
  const domainById = new Map(domains.map((d) => [d._id.toHexString(), d]));
  const ownIds = new Map(connections.map((c) => [c._id.toHexString(), ownKeyIdOf(c)]));
  const now = deps.now ?? new Date();

  return keys.flatMap((key) => {
    const connection = connectionById.get(key.connectionId.toHexString());
    if (!connection) return [];
    const domain = key.domainId ? domainById.get(key.domainId.toHexString()) : undefined;
    if (ctx.projectScope !== null && !domain) return [];
    return [
      toDTO(key, {
        connectionName: connection.name,
        connectionKeyLast4: connection.apiKeyLast4 ?? null,
        ownKeyId: ownIds.get(connection._id.toHexString()) ?? null,
        domainName: domain?.name ?? null,
        now,
      }),
    ];
  });
}

async function loadKey(ctx: OrgContext, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ServiceError("not_found", "API key not found.");
  const key = await ApiKeyModel.findOne({ _id: id, orgId: orgOid(ctx) });
  if (!key) throw new ServiceError("not_found", "API key not found.");
  if (ctx.projectScope !== null) {
    const domain = key.domainId
      ? await DomainModel.findOne(
          { _id: key.domainId, orgId: orgOid(ctx) },
          { projectId: 1 },
        ).lean()
      : null;
    if (!domain || !canSeeProject(ctx, domain.projectId?.toHexString() ?? null)) {
      throw new ServiceError("not_found", "API key not found.");
    }
  }
  return key;
}

/* ------------------------------------------------------------------------------------------ */
/* Create                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/**
 * Creates a key in Resend and returns its secret exactly once. Sending keys need `apiKey:create`
 * or `apiKey:createSending` (Developers); full-access keys need `apiKey:create`.
 */
export async function createApiKey(
  ctx: OrgContext,
  raw: CreateApiKeyFormInput,
  deps: Deps = {},
): Promise<CreatedApiKeyDTO> {
  const input = createApiKeySchema.parse(raw);
  if (input.permission === "full_access") authorize(ctx, "apiKey:create");
  else if (!ctx.can("apiKey:create")) authorize(ctx, "apiKey:createSending");
  await connectDb();
  const orgId = orgOid(ctx);
  const connection = await loadLiveConnection(orgId, input.connectionId);
  assertManageable(connection);

  let domain: { _id: Types.ObjectId; resendId: string; name: string } | null = null;
  if (input.domainId) {
    const found = await DomainModel.findOne({
      _id: input.domainId,
      orgId,
      connectionId: connection._id,
      ...projectFilter(ctx),
    }).lean();
    if (!found) {
      throw new ServiceError("validation", "Pick a domain from this connection.", {
        domainId: ["Pick a domain from this connection."],
      });
    }
    domain = found;
  } else if (ctx.projectScope !== null) {
    throw new ServiceError("validation", "Limit the key to one of your domains.", {
      domainId: ["Limit the key to one of your domains."],
    });
  }

  const adapter = deps.adapter ?? adapterFor(connection);
  let created: { id: string; token: string };
  try {
    created = await withRateLimitRetry(() =>
      adapter.createApiKey({
        name: input.name,
        permission: input.permission,
        ...(domain ? { domainId: domain.resendId } : {}),
      }),
    );
  } catch (error) {
    resendProblem(error, { field: "name" });
  }

  const now = deps.now ?? new Date();
  // The key exists in Resend now. If mirroring it fails, the person must still get the secret.
  let mirrored: KeyDoc | null = null;
  try {
    mirrored = await withTransaction(async (session) => {
      const [doc] = await ApiKeyModel.create(
        [
          {
            orgId,
            connectionId: connection._id,
            resendId: created.id,
            name: input.name,
            permission: input.permission,
            domainId: domain?._id ?? null,
            resendCreatedAt: now,
            syncedAt: now,
            createdViaApp: true,
            createdBy: userOid(ctx),
          },
        ],
        { session },
      );
      await writeAuditLog(
        {
          orgId,
          actor: { type: "user", id: userOid(ctx) },
          action: "api_key.created",
          target: { type: "api_key", id: doc!._id },
          // Never the secret: name, scope and where it lives are enough.
          changes: {
            after: {
              name: input.name,
              permission: input.permission,
              domain: domain?.name ?? null,
              connectionId: connection._id.toHexString(),
            },
          },
        },
        { session },
      );
      await publish(
        {
          orgId,
          topics: ["api_keys", `connection:${connection._id.toHexString()}`],
          patch: { apiKey: doc!._id.toHexString(), created: true },
        },
        { session },
      );
      return doc!.toObject() as unknown as KeyDoc;
    });
  } catch (error) {
    console.error("[api-keys] created in Resend but could not be mirrored", error);
  }

  const key = toDTO(
    mirrored ?? {
      _id: new Types.ObjectId(),
      connectionId: connection._id,
      resendId: created.id,
      name: input.name,
      permission: input.permission,
      domainId: domain?._id ?? null,
      resendCreatedAt: now,
      createdViaApp: true,
    },
    {
      connectionName: connection.name,
      connectionKeyLast4: connection.apiKeyLast4 ?? null,
      ownKeyId: null,
      domainName: domain?.name ?? null,
      now,
    },
  );
  return { key, secret: created.token };
}

/* ------------------------------------------------------------------------------------------ */
/* Delete                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/**
 * Deletes a key in Resend, then its mirror (permission `apiKey:delete`). The key Wisemail itself
 * uses cannot be deleted (it would cut the connection off); a key that may be it needs
 * `acknowledgeInUse`.
 */
export async function deleteApiKey(
  ctx: OrgContext,
  raw: { apiKeyId: string; confirmName: string; acknowledgeInUse?: boolean },
  deps: Deps = {},
): Promise<{ id: string; name: string }> {
  authorize(ctx, "apiKey:delete");
  const input = deleteApiKeySchema.parse(raw);
  await connectDb();
  const key = await loadKey(ctx, input.apiKeyId);
  const connection = await loadLiveConnection(orgOid(ctx), key.connectionId);
  assertManageable(connection);
  const adapter = deps.adapter ?? adapterFor(connection);

  if (input.confirmName.trim() !== key.name.trim()) {
    throw new ServiceError("validation", "Type the key name exactly to confirm.", {
      confirmName: ["Type the key name exactly to confirm."],
    });
  }
  const inUse = keyInUse(key, adapter.ownApiKeyId());
  if (inUse === "exact") {
    throw new ServiceError(
      "conflict",
      `Wisemail uses this key for ${connection.name}. Deleting it would disconnect the account. Add a new key to the connection first, then delete this one in Resend.`,
    );
  }
  if (inUse === "possible" && !input.acknowledgeInUse) {
    throw new ServiceError(
      "conflict",
      `This key may be the one Wisemail uses for ${connection.name}${
        connection.apiKeyLast4 ? ` (ends in ${connection.apiKeyLast4})` : ""
      }. Confirm that you want to delete it anyway.`,
    );
  }

  try {
    await withRateLimitRetry(() => adapter.removeApiKey(key.resendId));
  } catch (error) {
    if (!(isResendError(error) && error.code === "resend_not_found")) resendProblem(error);
  }

  await withTransaction(async (session) => {
    await ApiKeyModel.deleteOne({ _id: key._id, orgId: key.orgId }, { session });
    await writeAuditLog(
      {
        orgId: key.orgId,
        actor: { type: "user", id: userOid(ctx) },
        action: "api_key.deleted",
        target: { type: "api_key", id: key._id },
        changes: {
          before: {
            name: key.name,
            permission: key.permission ?? null,
            connectionId: connection._id.toHexString(),
          },
        },
      },
      { session },
    );
    await publish(
      {
        orgId: key.orgId,
        topics: ["api_keys", `connection:${connection._id.toHexString()}`],
        patch: { apiKey: key._id.toHexString(), deleted: true },
      },
      { session },
    );
  });
  return { id: key._id.toHexString(), name: key.name };
}
