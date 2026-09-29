"use server";

import { z } from "zod";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import { PLANS } from "@/lib/db/models/org-settings";
import type { PlanChangePreviewDTO, PlanChangeResultDTO } from "@/lib/dto/billing";
import {
  cancelPendingChange,
  changePlan,
  previewPlanChange,
  startTrial,
} from "@/lib/services/plan-changes";

const planInput = z.object({ plan: z.enum(PLANS) });
const noInput = z.object({});

const preview = orgAction({ input: planInput, permission: "billing:manage" }, ({ ctx, input }) =>
  previewPlanChange(ctx, input.plan),
);
const change = orgAction({ input: planInput, permission: "billing:manage" }, ({ ctx, input }) =>
  changePlan(ctx, input.plan),
);
const cancel = orgAction({ input: noInput, permission: "billing:manage" }, async ({ ctx }) => {
  await cancelPendingChange(ctx);
  return { cancelled: true as const };
});
const trial = orgAction({ input: noInput, permission: "billing:manage" }, async ({ ctx }) => {
  await startTrial(ctx);
  return { started: true as const };
});

export async function previewPlanChangeAction(
  orgSlug: string,
  input: z.input<typeof planInput>,
): Promise<ActionResult<PlanChangePreviewDTO>> {
  return preview(orgSlug, input);
}

export async function changePlanAction(
  orgSlug: string,
  input: z.input<typeof planInput>,
): Promise<ActionResult<PlanChangeResultDTO>> {
  return change(orgSlug, input);
}

export async function cancelPendingChangeAction(
  orgSlug: string,
): Promise<ActionResult<{ cancelled: true }>> {
  return cancel(orgSlug, {});
}

export async function startTrialAction(orgSlug: string): Promise<ActionResult<{ started: true }>> {
  return trial(orgSlug, {});
}
