import type { ClientSession, Types } from "mongoose";

import { RealtimeEventModel } from "@/lib/db/models/realtime-event";

/**
 * Writes an invalidation event (TRD §2.6, DBD §4.9). Pass the caller's transaction `session` so
 * the event exists only if the data change committed. The change-stream hub and SSE route arrive
 * in Phase 5; until then events are written and expire by TTL.
 */
export async function publish(
  input: {
    orgId: Types.ObjectId;
    projectId?: Types.ObjectId | null;
    userId?: Types.ObjectId | null;
    topics: string[];
    /** Small field updates only; never secrets or email bodies. */
    patch?: Record<string, unknown> | null;
  },
  options: { session?: ClientSession } = {},
): Promise<void> {
  await RealtimeEventModel.create(
    [
      {
        orgId: input.orgId,
        projectId: input.projectId ?? null,
        userId: input.userId ?? null,
        topics: input.topics,
        patch: input.patch ?? null,
      },
    ],
    { session: options.session },
  );
}
