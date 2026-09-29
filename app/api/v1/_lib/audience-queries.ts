import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");

/** Query strings arrive as `string | null`; empty values mean "not set". */
const blankToUndefined = (input: unknown) =>
  Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(([, v]) => v !== "" && v != null),
  );

export const contactsQuery = z.preprocess(
  blankToUndefined,
  z.object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().trim().max(200).optional(),
    segmentId: objectId.optional(),
    topicId: objectId.optional(),
    connectionId: objectId.optional(),
    status: z.enum(["subscribed", "unsubscribed"]).optional(),
  }),
);
export type ContactsQuery = z.output<typeof contactsQuery>;
