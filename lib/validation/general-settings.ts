import { z } from "zod";

import { slugSchema } from "./org";

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export const updateGeneralSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give it a name (2+ characters).")
    .max(60, "Keep it under 60 characters."),
  slug: slugSchema,
  timezone: z.string().trim().min(1).refine(isValidTimeZone, "Pick a time zone from the list."),
});
export type UpdateGeneralInput = z.infer<typeof updateGeneralSchema>;

export const requestDeletionSchema = z.object({
  confirmName: z.string().trim().min(1, "Type the workspace name to confirm."),
});
export type RequestDeletionInput = z.infer<typeof requestDeletionSchema>;
