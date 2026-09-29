import "server-only";

import { Types } from "mongoose";

import type { OrgContext } from "@/lib/dal";
import { decryptSecret } from "@/lib/crypto/envelope";
import { ConnectionModel, type ConnectionDoc } from "@/lib/db/models/connections";
import type { ResendAdapter } from "@/lib/resend/adapter";
import { getResendAdapter } from "@/lib/resend/client-factory";
import { isResendError } from "@/lib/resend/errors";
import { ServiceError } from "./errors";
import { keyAad } from "./webhook-secret";

/**
 * Shared plumbing for services that change things in Resend on a member's behalf (domains, API
 * keys): find the connection inside the org, get an adapter with its decrypted key, refuse
 * read-only connections and turn Resend errors into messages a person can act on.
 */

export const orgOid = (ctx: Pick<OrgContext, "org">) => new Types.ObjectId(ctx.org.id);
export const userOid = (ctx: Pick<OrgContext, "user">) => new Types.ObjectId(ctx.user.id);

export async function loadLiveConnection(
  orgId: Types.ObjectId,
  connectionId: Types.ObjectId | string,
): Promise<ConnectionDoc> {
  if (!Types.ObjectId.isValid(connectionId)) {
    throw new ServiceError("not_found", "We couldn't find that connection.");
  }
  const connection = await ConnectionModel.findOne({ _id: connectionId, orgId, deletedAt: null });
  if (!connection || !connection.apiKey) {
    throw new ServiceError("not_found", "We couldn't find that connection.");
  }
  return connection;
}

export function adapterFor(connection: ConnectionDoc): ResendAdapter {
  return getResendAdapter(decryptSecret(connection.apiKey!, { aad: keyAad(connection._id) }));
}

export function assertManageable(connection: ConnectionDoc) {
  if (connection.status === "read_only" || connection.status === "disabled") {
    throw new ServiceError(
      "conflict",
      "This connection is read only, so Wisemail can't change anything in Resend for it.",
    );
  }
  if (connection.status === "needs_attention") {
    throw new ServiceError(
      "conflict",
      "This connection needs attention first. Open Connections to fix it, then try again.",
    );
  }
}

/** Throws the `ServiceError` a Resend failure deserves. `field` gets validation messages. */
export function resendProblem(error: unknown, options: { field?: string } = {}): never {
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
          "Resend didn't allow that. Check that this connection's key has full access.",
        );
      case "resend_not_found":
        throw new ServiceError("not_found", "Resend no longer has that. Refresh and try again.");
      case "resend_validation":
        throw new ServiceError(
          "validation",
          error.message,
          options.field ? { [options.field]: [error.message] } : undefined,
        );
    }
  }
  console.error("[resend-access] unexpected Resend error", error);
  throw new ServiceError(
    "resend_unavailable",
    "We couldn't reach Resend to make that change. Try again in a moment.",
  );
}
