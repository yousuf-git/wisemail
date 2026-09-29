"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { ConnectionDTO } from "@/lib/dto/connection";
import type { SyncRequestResult } from "@/lib/dto/sync";
import { enableTracking, reregisterWebhook } from "@/lib/services/checklist-fixes";
import {
  addConnection,
  removeConnection,
  renameConnection,
  retryConnectionSetup,
} from "@/lib/services/connections";
import { syncNow } from "@/lib/services/sync";
import {
  addConnectionSchema,
  removeConnectionSchema,
  renameConnectionSchema,
  reregisterWebhookSchema,
  retryConnectionSchema,
  syncConnectionSchema,
  trackingFixSchema,
  type AddConnectionInput,
  type RemoveConnectionInput,
  type RenameConnectionInput,
  type ReregisterWebhookInput,
  type RetryConnectionInput,
  type SyncConnectionInput,
  type TrackingFixInput,
} from "@/lib/validation/connection";

const add = orgAction(
  { input: addConnectionSchema, permission: "connection:create" },
  ({ ctx, input }) => addConnection(ctx, input),
);
const rename = orgAction(
  { input: renameConnectionSchema, permission: "connection:update" },
  ({ ctx, input }) => renameConnection(ctx, input),
);
const remove = orgAction(
  { input: removeConnectionSchema, permission: "connection:delete" },
  ({ ctx, input }) => removeConnection(ctx, input),
);
const retry = orgAction(
  { input: retryConnectionSchema, permission: "connection:update" },
  ({ ctx, input }) => retryConnectionSetup(ctx, input),
);

const sync = orgAction(
  { input: syncConnectionSchema, permission: "connection:update" },
  ({ ctx, input }) => syncNow(ctx, input),
);
const tracking = orgAction(
  { input: trackingFixSchema, permission: "domain:update" },
  ({ ctx, input }) => enableTracking(ctx, input),
);
const webhook = orgAction(
  { input: reregisterWebhookSchema, permission: "connection:update" },
  ({ ctx, input }) => reregisterWebhook(ctx, input),
);

export async function addConnectionAction(
  orgSlug: string,
  input: AddConnectionInput,
): Promise<ActionResult<ConnectionDTO>> {
  return add(orgSlug, input);
}

export async function renameConnectionAction(
  orgSlug: string,
  input: RenameConnectionInput,
): Promise<ActionResult<ConnectionDTO>> {
  return rename(orgSlug, input);
}

export async function removeConnectionAction(
  orgSlug: string,
  input: RemoveConnectionInput,
): Promise<ActionResult<{ id: string }>> {
  return remove(orgSlug, input);
}

export async function retryConnectionAction(
  orgSlug: string,
  input: RetryConnectionInput,
): Promise<ActionResult<ConnectionDTO>> {
  return retry(orgSlug, input);
}

export async function syncNowAction(
  orgSlug: string,
  input: SyncConnectionInput,
): Promise<ActionResult<SyncRequestResult>> {
  return sync(orgSlug, input);
}

export async function enableTrackingAction(
  orgSlug: string,
  input: TrackingFixInput,
): Promise<ActionResult<Awaited<ReturnType<typeof enableTracking>>>> {
  return tracking(orgSlug, input);
}

export async function reregisterWebhookAction(
  orgSlug: string,
  input: ReregisterWebhookInput,
): Promise<ActionResult<Awaited<ReturnType<typeof reregisterWebhook>>>> {
  return webhook(orgSlug, input);
}
