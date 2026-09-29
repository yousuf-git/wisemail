import { z } from "zod";

export const connectionNameSchema = z
  .string()
  .trim()
  .min(2, "Give it a name (2+ characters).")
  .max(60, "Keep it under 60 characters.");

export const apiKeySchema = z
  .string()
  .trim()
  .regex(/^re_[A-Za-z0-9_-]{3,}$/, "That doesn't look like a Resend key. Keys start with re_.");

export const addConnectionSchema = z.object({ name: connectionNameSchema, apiKey: apiKeySchema });
export type AddConnectionInput = z.infer<typeof addConnectionSchema>;

const idSchema = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id.");

export const renameConnectionSchema = z.object({
  connectionId: idSchema,
  name: connectionNameSchema,
});
export type RenameConnectionInput = z.infer<typeof renameConnectionSchema>;

export const removeConnectionSchema = z.object({
  connectionId: idSchema,
  /** Typed by the person to confirm; must equal the connection's name. */
  confirmName: z.string(),
});
export type RemoveConnectionInput = z.infer<typeof removeConnectionSchema>;

export const retryConnectionSchema = z.object({ connectionId: idSchema });
export type RetryConnectionInput = z.infer<typeof retryConnectionSchema>;
