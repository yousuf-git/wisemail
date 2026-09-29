import type { ConnectionStatus } from "@/lib/db/models/connections";
import type { ChecklistItemDTO } from "./checklist";
import type { SyncStatusDTO } from "./sync";

/** What the browser may know about a connection. Never any ciphertext; only `last4`. */
export type ConnectionDTO = {
  id: string;
  name: string;
  status: ConnectionStatus;
  statusReason: string | null;
  apiKeyLast4: string | null;
  webhookRegistered: boolean;
  lastEventAt: string | null;
  lastSyncAt: string | null;
  /** Setup checklist as of the last sync or fix; null until the first sync has finished. */
  checklist: ChecklistItemDTO[] | null;
  /** The latest sync run, if any. */
  sync: SyncStatusDTO | null;
  createdAt: string;
};

/** Plain-language explanation for each status reason we set. */
export const STATUS_REASON_COPY: Record<string, string> = {
  webhook_slot_unavailable:
    "Your Resend account has no free webhook slot, so Wisemail can't listen for events yet. Delete an unused webhook in Resend → Webhooks (Resend Pro allows 5, Scale 10), then retry.",
  webhook_registration_failed:
    "We couldn't register our webhook with Resend. Check that the key still has full access, then retry.",
  key_revoked:
    "Resend no longer accepts this key. Create a new Full access key in Resend → API Keys.",
  over_plan_limit:
    "This workspace is over its plan's connection limit. Events still arrive; sending and changes are paused.",
};

export type ConnectionQuota = {
  used: number;
  limit: number;
  planLabel: string;
  nextTierLabel: string | null;
};
