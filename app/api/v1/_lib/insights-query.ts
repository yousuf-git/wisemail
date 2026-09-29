import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");
const blank = (input: unknown) =>
  Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(([, v]) => v !== "" && v != null),
  );

export const insightsQuery = z.preprocess(
  blank,
  z.object({
    days: z.coerce
      .number()
      .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
      .default(7),
    connectionId: objectId.optional(),
    domainId: objectId.optional(),
    projectId: objectId.optional(),
    stream: z.enum(["transactional", "broadcast", "inbound"]).optional(),
  }),
);
