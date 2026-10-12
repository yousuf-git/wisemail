"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import {
  openBillingPortal,
  startCreditPackCheckout,
  startPlanCheckout,
} from "@/lib/billing/checkout";
import { MAX_PACKS_PER_PURCHASE } from "@/lib/billing/stripe-prices";
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
const checkoutInput = z.object({
  plan: z.enum(["pro", "team", "agency"]),
  interval: z.enum(["month", "year"]),
});
const packInput = z.object({ quantity: z.number().int().min(1).max(MAX_PACKS_PER_PURCHASE) });

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

const checkout = orgAction(
  { input: checkoutInput, permission: "billing:manage" },
  async ({ ctx, input }) => startPlanCheckout(ctx, await headers(), input),
);
const portal = orgAction({ input: noInput, permission: "billing:manage" }, async ({ ctx }) =>
  openBillingPortal(ctx, await headers()),
);
const pack = orgAction({ input: packInput, permission: "billing:manage" }, ({ ctx, input }) =>
  startCreditPackCheckout(ctx, input),
);

/** Stripe Checkout for a plan (Owner). Returns the URL to send the browser to. */
export async function startCheckoutAction(
  orgSlug: string,
  input: z.input<typeof checkoutInput>,
): Promise<ActionResult<{ url: string }>> {
  return checkout(orgSlug, input);
}

/** Stripe Customer Portal: invoices, payment method, downgrade, cancel (Owner). */
export async function openPortalAction(orgSlug: string): Promise<ActionResult<{ url: string }>> {
  return portal(orgSlug, {});
}

/** One-time AI credit pack through Stripe Checkout (Owner, paid plans). */
export async function buyCreditPackAction(
  orgSlug: string,
  input: z.input<typeof packInput>,
): Promise<ActionResult<{ url: string }>> {
  return pack(orgSlug, input);
}
