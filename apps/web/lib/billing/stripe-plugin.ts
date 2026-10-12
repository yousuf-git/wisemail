import "server-only";

import { stripe } from "@better-auth/stripe";
import mongoose, { Types } from "mongoose";
import type Stripe from "stripe";

import { roleHasPermission } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db/connect";
import { env } from "@/lib/env";
import { getStripe, webhookSecrets } from "./stripe";
import { PAID_PLANS, planPriceKey, priceId } from "./stripe-prices";

/**
 * Better Auth Stripe plugin configuration: the organization is the Stripe customer and the
 * subscription's `referenceId` (TRD §2.10). The plugin owns plan checkout (`upgradeSubscription`),
 * the Customer Portal, its `subscription` collection and `/api/auth/stripe/webhook`
 * (STRIPE_WEBHOOK_SECRET; subscribe it to `checkout.session.completed` and
 * `customer.subscription.created|updated|deleted`).
 *
 * Every lifecycle hook feeds the same idempotent sync (`lib/services/billing.ts`): the org's
 * plan, state, period and payment grace are derived from the Stripe subscription, and the
 * subscription's extra items (tier overage meter, Agency extra connections) are reconciled.
 * Services are imported lazily so this module never joins an import cycle with the auth setup.
 */

type SubscriptionEvent = {
  event: Stripe.Event;
  stripeSubscription: Stripe.Subscription;
  subscription: { referenceId: string };
};

async function applySubscription({ event, stripeSubscription, subscription }: SubscriptionEvent) {
  if (!/^[0-9a-f]{24}$/i.test(subscription.referenceId)) return;
  const orgId = new Types.ObjectId(subscription.referenceId);
  const { snapshotFromStripe, syncSubscription } = await import("@/lib/services/billing");
  const result = await syncSubscription(
    snapshotFromStripe(orgId, stripeSubscription, new Date(event.created * 1000)),
  );
  if (!result.applied) return;
  if (["active", "trialing", "past_due"].includes(stripeSubscription.status)) {
    try {
      const { reconcileSubscriptionItems } = await import("@/lib/services/billing-extras");
      await reconcileSubscriptionItems(orgId, stripeSubscription);
    } catch (error) {
      // The plan itself is already applied; the next subscription event retries the items.
      console.error("[billing] could not reconcile subscription items", error);
    }
  }
}

export function stripePlugin() {
  return stripe({
    stripeClient: getStripe(),
    stripeWebhookSecret: webhookSecrets().plugin,
    createCustomerOnSignUp: false,
    organization: {
      enabled: true,
      getCustomerCreateParams: async (org) => ({
        name: org.name,
        metadata: { wisemailOrgSlug: org.slug },
      }),
      onCustomerCreate: async ({ stripeCustomer, organization }) => {
        await connectDb();
        const { OrgSettingsModel } = await import("@/lib/db/models/org-settings");
        await OrgSettingsModel.updateOne(
          { orgId: new Types.ObjectId(organization.id) },
          { $set: { stripeCustomerId: stripeCustomer.id } },
          { timestamps: false },
        );
      },
    },
    subscription: {
      enabled: true,
      plans: () =>
        PAID_PLANS.map((plan) => ({
          name: plan,
          priceId: priceId(planPriceKey(plan, "month")),
          annualDiscountPriceId: priceId(planPriceKey(plan, "year")),
        })),
      // Only Owners (billing:manage) may act for an organization; nothing works without billing.
      authorizeReference: async ({ user, referenceId }) => {
        if (!env.BILLING_ENABLED || !/^[0-9a-f]{24}$/i.test(referenceId)) return false;
        await connectDb();
        const member = await mongoose.connection.collection("member").findOne({
          organizationId: new Types.ObjectId(referenceId),
          userId: new Types.ObjectId(user.id),
        } as never);
        return !!member && roleHasPermission(String(member.role), "billing:manage");
      },
      // Subscriptions are created in flexible billing mode so the monthly metered overage item
      // and the extra-connection item can join an annual plan (mixed intervals).
      getCheckoutSessionParams: () => ({
        params: {
          subscription_data: { billing_mode: { type: "flexible" } },
          allow_promotion_codes: true,
          billing_address_collection: "auto",
        },
      }),
      onSubscriptionComplete: (data) => applySubscription(data),
      onSubscriptionCreated: (data) => applySubscription(data),
      onSubscriptionUpdate: (data) => applySubscription(data),
      onSubscriptionCancel: (data) => applySubscription(data),
      onSubscriptionDeleted: (data) => applySubscription(data),
    },
  });
}
