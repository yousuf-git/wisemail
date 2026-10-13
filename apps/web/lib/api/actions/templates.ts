/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const createTemplateAction = org("templates.create");
export const deleteTemplateAction = org("templates.remove");
export const duplicateTemplateAction = org("templates.duplicate");
export const updateTemplateAction = org("templates.update");
