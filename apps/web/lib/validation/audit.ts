import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Query strings arrive as `string | null`; empty values mean "not set". */
const blankToUndefined = (input: unknown) =>
  Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(([, v]) => v !== "" && v != null),
  );

export const auditQuery = z.preprocess(
  blankToUndefined,
  z.object({
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    /** A user id, or `system`. */
    actor: z.union([objectId, z.literal("system")]).optional(),
    /** Exact action (`member.invited`) or a prefix ending in a dot (`member.`). */
    action: z.string().trim().min(1).max(80).optional(),
    targetType: z.string().trim().min(1).max(60).optional(),
    from: day.optional(),
    to: day.optional(),
  }),
);
export type AuditQuery = z.output<typeof auditQuery>;
