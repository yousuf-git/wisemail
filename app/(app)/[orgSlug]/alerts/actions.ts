"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { AlertRuleDTO, IncidentDTO } from "@/lib/dto/alert";
import {
  acknowledgeIncident,
  createAlertRule,
  deleteAlertRule,
  setAlertRuleEnabled,
  updateAlertRule,
} from "@/lib/services/alerts";
import {
  alertRuleIdSchema,
  alertRuleInputSchema,
  incidentIdSchema,
  setRuleEnabledSchema,
  updateAlertRuleSchema,
  type AlertRuleInput,
  type UpdateAlertRuleInput,
} from "@/lib/validation/alert";

const create = orgAction(
  { input: alertRuleInputSchema, permission: "alertRule:create" },
  ({ ctx, input }) => createAlertRule(ctx, input),
);
const update = orgAction(
  { input: updateAlertRuleSchema, permission: "alertRule:update" },
  ({ ctx, input }) => updateAlertRule(ctx, input),
);
const enable = orgAction(
  { input: setRuleEnabledSchema, permission: "alertRule:update" },
  ({ ctx, input }) => setAlertRuleEnabled(ctx, input),
);
const remove = orgAction(
  { input: alertRuleIdSchema, permission: "alertRule:delete" },
  ({ ctx, input }) => deleteAlertRule(ctx, input.id),
);
const acknowledge = orgAction(
  { input: incidentIdSchema, permission: "alertRule:update" },
  ({ ctx, input }) => acknowledgeIncident(ctx, input.incidentId),
);

export async function createAlertRuleAction(
  orgSlug: string,
  input: AlertRuleInput,
): Promise<ActionResult<AlertRuleDTO>> {
  return create(orgSlug, input);
}

export async function updateAlertRuleAction(
  orgSlug: string,
  input: UpdateAlertRuleInput,
): Promise<ActionResult<AlertRuleDTO>> {
  return update(orgSlug, input);
}

export async function setAlertRuleEnabledAction(
  orgSlug: string,
  input: { id: string; enabled: boolean },
): Promise<ActionResult<AlertRuleDTO>> {
  return enable(orgSlug, input);
}

export async function deleteAlertRuleAction(
  orgSlug: string,
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  return remove(orgSlug, input);
}

export async function acknowledgeIncidentAction(
  orgSlug: string,
  input: { incidentId: string },
): Promise<ActionResult<IncidentDTO>> {
  return acknowledge(orgSlug, input);
}
