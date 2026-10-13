/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const createProjectAction = org("settings.projects.create");
export const deleteProjectAction = org("settings.projects.remove");
export const updateProjectAction = org("settings.projects.update");
