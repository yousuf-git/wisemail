import "server-only";

import { Types } from "mongoose";

import {
  PAID_PLANS,
  planPriceKey,
  stripeLookupKey,
  type BillingInterval,
  type PaidPlan,
} from "@wisemail/shared/stripe-prices";

import { getStripe } from "@/lib/billing/stripe";
import { connectDb } from "@/lib/db/connect";
import { PlanModel } from "@/lib/db/models/plan";
import { PriceChangeModel } from "@/lib/db/models/price-change";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { env } from "@/lib/env";
import { writeAdminAudit } from "@/lib/services/admin/audit";
import { invalidateCatalogCache } from "@/lib/services/catalog";
import { ServiceError } from "@/lib/services/errors";
import type { AdminActor } from "@/lib/admin/guard";

/**
 * Admin-driven catalog price change: create a new Stripe Price (taking over the lookup key),
 * archive the old one, record `price_changes`, and enqueue subscription migration at next renewal.
 */

export type ApplyPlanPriceChangeInput = {
  plan: PaidPlan;
  interval: BillingInterval;
  /** New catalog amount: monthly USD, or per-month USD when interval is year (stored as today). */
  priceUsd: number;
  admin: AdminActor;
  reason?: string;
};

export type ApplyPlanPriceChangeResult = {
  priceChangeId: string;
  oldStripePriceId: string;
  newStripePriceId: string;
  oldAmountUsd: number;
  newAmountUsd: number;
};

function amountCents(plan: PaidPlan, interval: BillingInterval, priceUsd: number): number {
  if (interval === "year") return Math.round(priceUsd * 12 * 100);
  return Math.round(priceUsd * 100);
}

function displayAmount(planDoc: {
  priceMonthly: number;
  priceAnnualPerMonth: number;
}, interval: BillingInterval): number {
  return interval === "year" ? planDoc.priceAnnualPerMonth : planDoc.priceMonthly;
}

export async function applyPlanPriceChange(
  input: ApplyPlanPriceChangeInput,
): Promise<ApplyPlanPriceChangeResult> {
  if (!env.BILLING_ENABLED) {
    throw new ServiceError("billing_unavailable", "Billing is not enabled.");
  }
  if (!(input.priceUsd > 0) || !Number.isFinite(input.priceUsd)) {
    throw new ServiceError("validation", "Price must be a positive number.");
  }

  await connectDb();
  const priceKey = planPriceKey(input.plan, input.interval);
  const lookupKey = stripeLookupKey(priceKey);
  const planDoc = await PlanModel.findById(input.plan);
  if (!planDoc) throw new ServiceError("not_found", "Plan not found.");

  const oldAmountUsd = displayAmount(planDoc, input.interval);
  if (oldAmountUsd === input.priceUsd) {
    throw new ServiceError("validation", "The new price matches the current catalog price.");
  }

  const oldStripePriceId =
    (input.interval === "year" ? planDoc.stripe?.priceAnnualId : planDoc.stripe?.priceMonthlyId) ??
    null;
  if (!oldStripePriceId) {
    throw new ServiceError(
      "billing_unavailable",
      "This plan has no Stripe price yet. Seed price ids or create one first.",
    );
  }

  const stripe = getStripe();
  let productId = planDoc.stripe?.productId ?? null;
  if (!productId) {
    const product = await stripe.products.create({
      name: `Wisemail ${planDoc.label}`,
      metadata: { wisemail_plan: input.plan },
    });
    productId = product.id;
  }

  const newPrice = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: amountCents(input.plan, input.interval, input.priceUsd),
    recurring: { interval: input.interval === "year" ? "year" : "month" },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    metadata: {
      wisemail_plan: input.plan,
      wisemail_interval: input.interval,
      wisemail_price_key: priceKey,
    },
  });

  try {
    await stripe.prices.update(oldStripePriceId, { active: false });
  } catch (error) {
    console.warn("[price-changes] could not archive old price", oldStripePriceId, error);
  }

  const setFields: Record<string, unknown> = {
    "stripe.productId": productId,
  };
  if (input.interval === "year") {
    setFields.priceAnnualPerMonth = input.priceUsd;
    setFields["stripe.priceAnnualId"] = newPrice.id;
    setFields["stripe.lookupAnnual"] = lookupKey;
  } else {
    setFields.priceMonthly = input.priceUsd;
    setFields["stripe.priceMonthlyId"] = newPrice.id;
    setFields["stripe.lookupMonthly"] = lookupKey;
  }

  await PlanModel.updateOne({ _id: input.plan }, { $set: setFields });
  invalidateCatalogCache();

  const change = await PriceChangeModel.create({
    plan: input.plan,
    interval: input.interval,
    priceKey,
    lookupKey,
    oldAmountUsd,
    newAmountUsd: input.priceUsd,
    oldStripePriceId,
    newStripePriceId: newPrice.id,
    productId,
    status: "pending",
    actorId: new Types.ObjectId(input.admin.id),
    reason: input.reason ?? null,
  });

  await writeAdminAudit({
    admin: input.admin,
    action: "admin.price_changed",
    target: { type: "plan", id: input.plan },
    reason: input.reason,
    changes: {
      after: {
        interval: input.interval,
        oldAmountUsd,
        newAmountUsd: input.priceUsd,
        oldStripePriceId,
        newStripePriceId: newPrice.id,
      },
    },
  });

  const { enqueuePriceMigration } = await import("@/lib/jobs/send");
  const delivered = await enqueuePriceMigration({ priceChangeId: change._id.toHexString() });
  if (!delivered) {
    // Dev without Inngest: migrate inline.
    const { migratePriceChange } = await import("@/lib/services/price-migration");
    await migratePriceChange(change._id.toHexString());
  }

  return {
    priceChangeId: change._id.toHexString(),
    oldStripePriceId,
    newStripePriceId: newPrice.id,
    oldAmountUsd,
    newAmountUsd: input.priceUsd,
  };
}

/** Open price migrations that affect orgs on `plan` + `interval` (for billing callout). */
export async function findOpenPriceMigration(input: {
  plan: string;
  interval: BillingInterval | null;
}) {
  if (!input.interval || input.plan === "free") return null;
  if (!(PAID_PLANS as readonly string[]).includes(input.plan)) return null;
  await connectDb();
  return PriceChangeModel.findOne({
    plan: input.plan as PaidPlan,
    interval: input.interval,
    status: { $in: ["pending", "migrating"] },
  })
    .sort({ createdAt: -1 })
    .lean();
}

/** Orgs still on the old Stripe price for a change (have a subscription id). */
export async function listOrgsForPriceMigration(oldStripePriceId: string, afterId?: Types.ObjectId) {
  await connectDb();
  const filter: Record<string, unknown> = {
    stripeSubscriptionId: { $ne: null },
    deletedAt: null,
  };
  if (afterId) filter._id = { $gt: afterId };
  // We cannot filter by Stripe price in Mongo; the migration job checks each subscription.
  return OrgSettingsModel.find(filter, {
    orgId: 1,
    stripeSubscriptionId: 1,
    plan: 1,
    billingInterval: 1,
    stripePeriodEnd: 1,
  })
    .sort({ _id: 1 })
    .limit(50)
    .lean();
}
