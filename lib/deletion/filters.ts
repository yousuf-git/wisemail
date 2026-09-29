import "server-only";

import { Types } from "mongoose";
import { z } from "zod";

import { EmailModel } from "@/lib/db/models/emails";
import { ThreadModel } from "@/lib/db/models/threads";
import { buildActivityFilter, type ActivityFilters } from "@/lib/services/emails";
import { projectFilter } from "@/lib/services/project-scope";

/**
 * "All matching this filter" for bulk trash / delete / restore (PRD §5.16, TRD §2.14). A
 * `BulkFilter` is what the client sends and what is stored on the `bulk_operations` document;
 * `resolveSelection` turns it into a Mongo query (always tenant- and project-scoped) so the count
 * shown in the confirmation and the job that runs later select exactly the same thing.
 */

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");
const text = z.string().trim().max(300);

const activityFiltersSchema = z.object({
  connectionId: objectId.optional(),
  projectId: objectId.optional(),
  domainId: objectId.optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  statuses: z.array(z.string().max(40)).max(20).optional(),
  recipient: text.optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  q: text.optional(),
});

export const bulkFilterSchema = z.discriminatedUnion("source", [
  /** Conversations in the Inbox (unread filtering is per member and not part of a snapshot). */
  z.object({
    source: z.literal("inbox"),
    q: text.optional(),
    mailboxAddress: text.optional(),
    connectionId: objectId.optional(),
    projectId: objectId.optional(),
    starred: z.boolean().optional(),
  }),
  /** Emails in the Activity log. */
  z.object({ source: z.literal("activity"), filters: activityFiltersSchema }),
  /** Everything in Trash (Empty trash, Restore all). */
  z.object({ source: z.literal("trash") }),
  /** Whatever a bulk trash moved (its Undo). */
  z.object({ source: z.literal("operation"), opId: objectId }),
]);
export type BulkFilter = z.infer<typeof bulkFilterSchema>;

export type Selection = {
  target: "threads" | "emails";
  /** Base query; combine with `_id` / `createdAt` conditions for batching. */
  query: Record<string, unknown>;
};

export type SelectionScope = { orgId: Types.ObjectId; projectScope: string[] | null };

const oid = (value: string | undefined) =>
  value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined;

/** Which collection a filter selects from. */
export const targetOf = (filter: BulkFilter): "threads" | "emails" =>
  filter.source === "inbox" ? "threads" : "emails";

export async function resolveSelection(
  scope: SelectionScope,
  filter: BulkFilter,
): Promise<Selection> {
  const { orgId, projectScope } = scope;
  const scoped = projectFilter({ projectScope });

  if (filter.source === "trash") {
    return { target: "emails", query: { orgId, trashedAt: { $ne: null }, ...scoped } };
  }
  if (filter.source === "operation") {
    return {
      target: "emails",
      query: { orgId, trashedByOpId: new Types.ObjectId(filter.opId), ...scoped },
    };
  }
  if (filter.source === "activity") {
    return {
      target: "emails",
      query: buildActivityFilter(orgId, projectScope, (filter.filters ?? {}) as ActivityFilters),
    };
  }

  const query: Record<string, unknown> = {
    orgId,
    ...scoped,
    messageCount: { $gt: 0 },
    trashedAt: null,
    archived: false,
  };
  if (filter.mailboxAddress) query.mailboxAddress = filter.mailboxAddress.toLowerCase();
  const connectionId = oid(filter.connectionId);
  if (connectionId) query.connectionId = connectionId;
  const projectId = oid(filter.projectId);
  if (projectId) {
    // Narrowing inside the member's own scope: intersect, never widen.
    const allowed = scoped.projectId?.$in;
    query.projectId =
      allowed && !allowed.some((p) => p.equals(projectId)) ? { $in: [] } : projectId;
  }
  if (filter.starred) query.starred = true;
  if (filter.q?.trim()) {
    const ids = await EmailModel.distinct("threadId", {
      orgId,
      $text: { $search: filter.q.trim() },
      threadId: { $ne: null },
      ...scoped,
    });
    query._id = { $in: ids };
  }
  return { target: "threads", query };
}

/** How many items a filter selects right now, for the "Select all 4,812 matching" confirmation. */
export async function countSelection(scope: SelectionScope, filter: BulkFilter): Promise<number> {
  const { target, query } = await resolveSelection(scope, filter);
  return target === "threads"
    ? ThreadModel.countDocuments(query)
    : EmailModel.countDocuments(query);
}
