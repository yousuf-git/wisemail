import { z } from "zod";

/** Palette token names (FED §2). Projects store the token, never a hex value. */
export const PROJECT_COLORS = [
  "accent",
  "engaged",
  "success",
  "warning",
  "coral",
  "danger",
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

/** Static class strings so Tailwind can see them. */
export const PROJECT_COLOR_CLASS: Record<ProjectColor, string> = {
  accent: "bg-accent",
  engaged: "bg-engaged",
  success: "bg-success",
  warning: "bg-warning",
  coral: "bg-coral",
  danger: "bg-danger",
};

export const projectNameSchema = z
  .string()
  .trim()
  .min(2, "Give it a name (2+ characters).")
  .max(60, "Keep it under 60 characters.");

export const projectColorSchema = z.enum(PROJECT_COLORS, { error: "Pick a color." });
export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(240, "Keep it under 240 characters.")
  .optional();

const idSchema = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id.");

export const createProjectSchema = z.object({
  name: projectNameSchema,
  color: projectColorSchema,
  description: projectDescriptionSchema,
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  projectId: idSchema,
  name: projectNameSchema,
  color: projectColorSchema,
  description: projectDescriptionSchema,
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const deleteProjectSchema = z.object({ projectId: idSchema });
export type DeleteProjectInput = z.infer<typeof deleteProjectSchema>;

export const setMemberScopeSchema = z.object({
  memberId: idSchema,
  /** Empty array clears the restriction. */
  projectIds: z.array(idSchema).max(200),
});
export type SetMemberScopeInput = z.infer<typeof setMemberScopeSchema>;

export function slugifyProjectName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "project";
}
