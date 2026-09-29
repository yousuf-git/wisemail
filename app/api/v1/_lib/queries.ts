import { z } from "zod";

import { EMAIL_STATUSES } from "@/lib/db/models/emails";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");
const flag = z
  .enum(["1", "true", "0", "false"])
  .transform((value) => value === "1" || value === "true");
const limit = z.coerce.number().int().min(1).max(100).optional();
const cursor = z.string().min(1).max(512).optional();

/** Query strings arrive as `string | null`; empty values mean "not set". */
const blankToUndefined = (input: unknown) =>
  Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(([, v]) => v !== "" && v != null),
  );

export const threadsQuery = z.preprocess(
  blankToUndefined,
  z.object({
    folder: z.enum(["inbox", "sent", "scheduled", "trash"]).default("inbox"),
    cursor,
    limit,
    q: z.string().trim().max(200).optional(),
    unread: flag.optional(),
    mailboxAddress: z.string().trim().max(320).optional(),
    projectId: objectId.optional(),
    connectionId: objectId.optional(),
  }),
);
export type ThreadsQuery = z.output<typeof threadsQuery>;

const statuses = z
  .string()
  .transform((value) => value.split(",").filter(Boolean))
  .pipe(z.array(z.enum(EMAIL_STATUSES)).max(EMAIL_STATUSES.length));

export const activityQuery = z.preprocess(
  blankToUndefined,
  z.object({
    cursor,
    limit,
    q: z.string().trim().max(200).optional(),
    status: statuses.optional(),
    direction: z.enum(["inbound", "outbound"]).optional(),
    connectionId: objectId.optional(),
    domainId: objectId.optional(),
    projectId: objectId.optional(),
    recipient: z.string().trim().max(320).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
);
export type ActivityQuery = z.output<typeof activityQuery>;

/** Maps a parsed activity query onto `listActivity`'s input. */
export function toActivityInput(query: ActivityQuery) {
  const { cursor, limit, status, ...filters } = query;
  return { cursor, limit, filters: { ...filters, statuses: status } };
}
