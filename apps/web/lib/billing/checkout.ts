import "server-only";

import { Types } from "mongoose";
import mongoose from "mongoose";
import { APIError } from "better-auth/api";

import { getEntitlements } from "@/lib/billing/entitlements";
import { auth } from "@/lib/auth/server";
import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { env } from "@/lib/env";
import { ServiceError } from "@/lib/services/errors";
import { getStripe } from "./stripe";
import {
  CREDIT_PACK_CREDITS,
  MAX_PACKS_PER_PURCHASE,
  isPaidPlan,
  priceId,
  type BillingInterval,
} from "./stripe-prices";

/**
 * Stripe entry points for the Owner (`billing:manage`), TRD §2.10:
 * - `startPlanCheckout`: Pro / Team / Agency, monthly or annual, through the Better Auth Stripe
 *   plugin (organization as customer). First subscription: Stripe Checkout. An org that already
 *   subscribes gets Stripe's confirmation page for the plan change instead.
 * - `openBillingPortal`: Customer Portal for invoices, payment method, downgrade and cancel.
 * - `startCreditPackCheckout`: one-time AI credit pack (`checkout.session.completed` on the
 *   billing webhook grants the credits).
 * All of them return a URL to redirect the browser to; nothing here changes the plan itself,
 * that happens when Stripe's webhooks arrive.
 *
 * Trial: the 14-day Pro trial stays app-side (no card, `org_settings.trial`, PRICING §6). Stripe
 * subscriptions start immediately and simply replace it; there is no Stripe trial.
 */

function assertBillingOn() {
  if (!env.BILLING_ENABLED) {
    throw new ServiceError("billing_unavailable", "Payments are not switched on yet.");
  }
}

/** Better Auth answers with `APIError`; the message is safe to show. */
function asServiceError(error: unknown, fallback: string): never {
  if (error instanceof ServiceError) throw error;
  if (error instanceof APIError) {
    const message = (error.body as { message?: string } | undefined)?.message ?? fallback;
    const code = (error.body as { code?: string } | undefined)?.code;
    if (code === "ALREADY_SUBSCRIBED_PLAN") {
      throw new ServiceError("validation", "You are already on that plan.");
    }
    throw new ServiceError("billing_unavailable", message);
  }
  console.error("[billing] stripe call failed", error);
  throw new ServiceError("billing_unavailable", fallback);
}

const billingPath = (ctx: OrgContext) => `/${ctx.org.slug}/settings/billing`;

export async function startPlanCheckout(
  ctx: OrgContext,
  headers: Headers,
  input: { plan: string; interval: BillingInterval },
): Promise<{ url: string }> {
  authorize(ctx, "billing:manage");
  assertBillingOn();
  if (!isPaidPlan(input.plan)) {
    throw new ServiceError("validation", "Pick Pro, Team or Agency.");
  }
  try {
    const result = await auth.api.upgradeSubscription({
      headers,
      body: {
        plan: input.plan,
        annual: input.interval === "year",
        customerType: "organization",
        referenceId: ctx.org.id,
        successUrl: `${billingPath(ctx)}?checkout=success`,
        cancelUrl: `${billingPath(ctx)}?checkout=cancelled`,
        returnUrl: `${billingPath(ctx)}?checkout=success`,
        disableRedirect: true,
      },
    });
    if (!("url" in result) || !result.url) {
      throw new ServiceError("billing_unavailable", "Stripe didn't return a checkout page.");
    }
    return { url: result.url };
  } catch (error) {
    return asServiceError(error, "We couldn't open checkout. Please try again.");
  }
}

export async function openBillingPortal(
  ctx: OrgContext,
  headers: Headers,
): Promise<{ url: string }> {
  authorize(ctx, "billing:manage");
  assertBillingOn();
  try {
    const result = await auth.api.createBillingPortal({
      headers,
      body: {
        customerType: "organization",
        referenceId: ctx.org.id,
        returnUrl: billingPath(ctx),
        disableRedirect: true,
      },
    });
    return { url: result.url };
  } catch (error) {
    if (
      error instanceof APIError &&
      (error.body as { code?: string })?.code === "CUSTOMER_NOT_FOUND"
    ) {
      throw new ServiceError(
        "not_found",
        "There is no billing account yet. Choose a plan first, then manage it here.",
      );
    }
    return asServiceError(error, "We couldn't open the billing portal. Please try again.");
  }
}

/** The org's Stripe customer, created (and linked for the plugin) on first need. */
async function ensureOrgCustomer(ctx: OrgContext): Promise<string> {
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  const settings = await OrgSettingsModel.findOne({ orgId }, { stripeCustomerId: 1 }).lean();
  if (settings?.stripeCustomerId) return settings.stripeCustomerId;
  const orgs = mongoose.connection.collection("organization");
  const org = await orgs.findOne({ _id: orgId });
  const existing = org?.stripeCustomerId as string | undefined;
  if (existing) {
    await OrgSettingsModel.updateOne(
      { orgId },
      { $set: { stripeCustomerId: existing } },
      { timestamps: false },
    );
    return existing;
  }
  const customer = await getStripe().customers.create({
    name: ctx.org.name,
    metadata: {
      organizationId: ctx.org.id,
      customerType: "organization",
      wisemailOrgSlug: ctx.org.slug,
    },
  });
  await orgs.updateOne({ _id: orgId }, { $set: { stripeCustomerId: customer.id } });
  await OrgSettingsModel.updateOne(
    { orgId },
    { $set: { stripeCustomerId: customer.id } },
    { timestamps: false },
  );
  return customer.id;
}

export async function startCreditPackCheckout(
  ctx: OrgContext,
  input: { quantity?: number } = {},
): Promise<{ url: string }> {
  authorize(ctx, "billing:manage");
  assertBillingOn();
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PACKS_PER_PURCHASE) {
    throw new ServiceError("validation", `Buy between 1 and ${MAX_PACKS_PER_PURCHASE} packs.`);
  }
  const e = await getEntitlements(new Types.ObjectId(ctx.org.id));
  if (!e.features.ai) {
    throw new ServiceError(
      "plan_feature_locked",
      "AI credit packs are for paid plans. Upgrade first to use AI.",
    );
  }
  try {
    const customer = await ensureOrgCustomer(ctx);
    const credits = String(quantity * CREDIT_PACK_CREDITS);
    const metadata = { kind: "credit_pack", orgId: ctx.org.id, credits };
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer,
      client_reference_id: ctx.org.id,
      line_items: [{ price: priceId("CREDIT_PACK"), quantity }],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${env.APP_URL.replace(/\/$/, "")}${billingPath(ctx)}?pack=success`,
      cancel_url: `${env.APP_URL.replace(/\/$/, "")}${billingPath(ctx)}?pack=cancelled`,
    });
    if (!session.url)
      throw new ServiceError("billing_unavailable", "Stripe didn't return a checkout page.");
    return { url: session.url };
  } catch (error) {
    return asServiceError(error, "We couldn't open checkout. Please try again.");
  }
}
