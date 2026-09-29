"use server";

import { z } from "zod";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import {
  cleanupRuleInput,
  createCleanupRule,
  deleteCleanupRule,
  previewCleanupRule,
  setCleanupRuleEnabled,
  updateCleanupRule,
} from "@/lib/deletion/rules";
import type { CleanupPreviewDTO, CleanupRuleDTO } from "@/lib/dto/deletion";

/** Permissions are checked in the services: `cleanupRule:manage`, and `manageDelete` for `delete`. */

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");
type RuleInput = z.input<typeof cleanupRuleInput>;

const create = orgAction({ input: cleanupRuleInput }, ({ ctx, input }) =>
  createCleanupRule(ctx, input),
);
const updateInput = z.object({ id: objectId, rule: cleanupRuleInput });
const update = orgAction({ input: updateInput }, ({ ctx, input }) =>
  updateCleanupRule(ctx, input.id, input.rule),
);
const preview = orgAction({ input: cleanupRuleInput }, ({ ctx, input }) =>
  previewCleanupRule(ctx, input),
);
const toggle = orgAction(
  { input: z.object({ id: objectId, enabled: z.boolean() }) },
  ({ ctx, input }) => setCleanupRuleEnabled(ctx, input.id, input.enabled),
);
const remove = orgAction({ input: z.object({ id: objectId }) }, ({ ctx, input }) =>
  deleteCleanupRule(ctx, input.id),
);

export async function createCleanupRuleAction(
  orgSlug: string,
  input: RuleInput,
): Promise<ActionResult<CleanupRuleDTO>> {
  return create(orgSlug, input);
}

export async function updateCleanupRuleAction(
  orgSlug: string,
  input: { id: string; rule: RuleInput },
): Promise<ActionResult<CleanupRuleDTO>> {
  return update(orgSlug, input);
}

export async function previewCleanupRuleAction(
  orgSlug: string,
  input: RuleInput,
): Promise<ActionResult<CleanupPreviewDTO>> {
  return preview(orgSlug, input);
}

export async function setCleanupRuleEnabledAction(
  orgSlug: string,
  input: { id: string; enabled: boolean },
): Promise<ActionResult<CleanupRuleDTO>> {
  return toggle(orgSlug, input);
}

export async function deleteCleanupRuleAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  return remove(orgSlug, input);
}
