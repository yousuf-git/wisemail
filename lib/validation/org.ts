import { z } from "zod";

/** Top-level routes an org slug must not shadow. */
export const RESERVED_SLUGS = new Set([
  "api",
  "sign-in",
  "sign-up",
  "onboarding",
  "invite",
  "pricing",
  "settings",
  "admin",
  "app",
  "www",
  "_next",
  "static",
  "public",
  "help",
  "support",
  "login",
  "logout",
  "new",
]);

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export const slugSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters.")
  .max(40, "Keep it under 40 characters.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes only.")
  .refine((s) => !RESERVED_SLUGS.has(s), "That one is reserved. Try another.");

export const createOrgSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give it a name (2+ characters).")
    .max(60, "Keep it under 60 characters."),
  slug: slugSchema,
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const checkSlugSchema = z.object({ slug: slugSchema });
