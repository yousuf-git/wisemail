import "server-only";

import { Types } from "mongoose";
import type Stripe from "stripe";

import { PLAN_CATALOG } from "@/lib/billing/plans";
import { getStripe } from "@/lib/billing/stripe";
import {
  describePrice,
  extraConnectionPriceKey,
  overagePriceKey,
  priceId,
  type BillingInterval,
} from "@/lib/billing/stripe-prices";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { env } from "@/lib/env";
import { writeAuditLog } from "./audit";
import { ServiceError } from "./errors";
import { findPlanItem } from "./billing";

/**
 * Subscription items besides the plan (TRD §2.10 "Subscription items per org"):
 * - the overage item of the tier, metered (Billing Meters, see `billing-usage.ts`);
 * - Agency only: the extra-connection item, quantity `max(0, live connections - 15)`.
 *
 * Both are added and kept in line by `reconcileSubscriptionItems`, which runs whenever the
 * plugin reports a new or changed subscription. Extra connections are also set directly when
 * the Owner confirms a 16th (or later) connection, and lowered from the next period when one is
 * removed (PRICING §6).
 */

const included = () => PLAN_CATALOG.agency.limits.connections;
export const extraConnectionUnitUsd = () => PLAN_CATALOG.agency.extraConnectionUsd ?? 5;
export const extraConnectionsFor = (liveConnections: number) =>
  Math.max(0, liveConnections - included());

type ItemUpdate = NonNullable<Stripe.SubscriptionUpdateParams["items"]>[number];

async function liveConnectionCount(orgId: Types.ObjectId) {
  // Same count the connection limit uses: every connection that has not been removed.
  return ConnectionModel.countDocuments({ orgId, deletedAt: null });
}

/**
 * Makes the Stripe subscription carry exactly the items its plan needs: the tier's overage
 * item (replacing another tier's) and, on Agency, the extra-connection item at the right
 * quantity. Returns what it changed; a subscription that is already right sends nothing.
 */
export async function reconcileSubscriptionItems(
  orgId: Types.ObjectId,
  stripeSubscription: Pick<Stripe.Subscription, "id" | "items">,
  options: { proration?: Stripe.SubscriptionUpdateParams.ProrationBehavior } = {},
) {
  await connectDb();
  const found = findPlanItem(stripeSubscription);
  if (!found) return { changed: false, extraConnections: null as number | null };
  const { plan, interval } = found;
  const updates: ItemUpdate[] = [];

  const wantOverage = priceId(overagePriceKey(plan));
  const overageItems = stripeSubscription.items.data.filter(
    (i) => describePrice(i.price.id)?.kind === "overage",
  );
  for (const item of overageItems) {
    if (item.price.id !== wantOverage) updates.push({ id: item.id, deleted: true });
  }
  if (!overageItems.some((i) => i.price.id === wantOverage)) updates.push({ price: wantOverage });

  const extraItem = stripeSubscription.items.data.find(
    (i) => describePrice(i.price.id)?.kind === "extra_connection",
  );
  let extraQuantity: number | null = null;
  if (plan === "agency") {
    extraQuantity = extraConnectionsFor(await liveConnectionCount(orgId));
    const wantExtra = priceId(extraConnectionPriceKey(interval));
    if (extraItem && extraItem.price.id !== wantExtra) {
      updates.push({ id: extraItem.id, deleted: true });
      if (extraQuantity > 0) updates.push({ price: wantExtra, quantity: extraQuantity });
    } else if (extraItem) {
      if ((extraItem.quantity ?? 0) !== extraQuantity) {
        updates.push({ id: extraItem.id, quantity: extraQuantity });
      }
    } else if (extraQuantity > 0) {
      updates.push({ price: wantExtra, quantity: extraQuantity });
    }
  } else if (extraItem) {
    updates.push({ id: extraItem.id, deleted: true });
  }

  if (updates.length > 0) {
    await getStripe().subscriptions.update(stripeSubscription.id, {
      items: updates,
      proration_behavior: options.proration ?? "create_prorations",
    });
  }
  if (extraQuantity !== null || plan !== "agency") {
    await OrgSettingsModel.updateOne(
      { orgId },
      { $set: { extraConnections: extraQuantity ?? 0 } },
      { timestamps: false },
    );
  }
  return { changed: updates.length > 0, extraConnections: extraQuantity ?? 0 };
}

/**
 * Sets the extra-connection quantity on the org's subscription (proration when it goes up,
 * none when it goes down: the lower quantity applies from the next invoice) and records it.
 */
export async function setExtraConnections(
  orgId: Types.ObjectId,
  quantity: number,
  options: { actorId?: Types.ObjectId } = {},
) {
  await connectDb();
  const settings = await OrgSettingsModel.findOne({ orgId }).lean();
  if (!settings || settings.plan !== "agency") {
    throw new ServiceError("plan_limit_reached", "Extra connections are part of the Agency plan.");
  }
  const subscriptionId = settings.stripeSubscriptionId;
  if (!subscriptionId) {
    throw new ServiceError(
      "billing_unavailable",
      "There is no active subscription to add the connection to. Open Billing to check your plan.",
    );
  }
  const current = settings.extraConnections ?? 0;
  if (current === quantity) return { quantity, changed: false };

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const found = findPlanItem(sub);
  const interval: BillingInterval = found?.interval ?? "month";
  const item = sub.items.data.find((i) => describePrice(i.price.id)?.kind === "extra_connection");
  const raise = quantity > current;
  const items: ItemUpdate[] = item
    ? [{ id: item.id, quantity }]
    : quantity > 0
      ? [{ price: priceId(extraConnectionPriceKey(interval)), quantity }]
      : [];
  if (items.length > 0) {
    try {
      await stripe.subscriptions.update(subscriptionId, {
        items,
        proration_behavior: raise ? "create_prorations" : "none",
      });
    } catch (error) {
      console.error("[billing] could not update the extra-connection quantity", error);
      throw new ServiceError(
        "billing_unavailable",
        "We couldn't update your subscription just now. Nothing was changed, please try again.",
      );
    }
  }
  await OrgSettingsModel.updateOne(
    { orgId },
    { $set: { extraConnections: quantity } },
    { timestamps: false },
  );
  await writeAuditLog({
    orgId,
    actor: options.actorId ? { type: "user", id: options.actorId } : { type: "system" },
    action: "billing.extra_connections_changed",
    target: { type: "organization", id: orgId },
    changes: { before: { extraConnections: current }, after: { extraConnections: quantity } },
  });
  return { quantity, changed: true };
}

/**
 * Brings the extra-connection quantity in line with the live connection count (after a removal
 * or a failed add). Best effort: a Stripe outage must not fail the removal that triggered it.
 */
export async function syncExtraConnections(orgId: Types.ObjectId): Promise<void> {
  if (!env.BILLING_ENABLED) return;
  try {
    await connectDb();
    const settings = await OrgSettingsModel.findOne(
      { orgId },
      { plan: 1, stripeSubscriptionId: 1 },
    ).lean();
    if (settings?.plan !== "agency" || !settings.stripeSubscriptionId) return;
    await setExtraConnections(orgId, extraConnectionsFor(await liveConnectionCount(orgId)));
  } catch (error) {
    console.error("[billing] extra-connection sync failed", error);
  }
}

export type ExtraConnectionPreview = {
  /** Adding one more connection costs extra. */
  needsExtra: boolean;
  unitUsd: number;
  currentExtra: number;
  newExtra: number;
  /** Monthly total for the extra connections after adding one. */
  monthlyUsd: number;
};

/** What adding one more connection would cost (for the confirmation before the 16th). */
export function previewExtraConnection(input: {
  plan: string;
  billingEnabled: boolean;
  liveConnections: number;
  currentExtra: number;
  limit: number;
}): ExtraConnectionPreview {
  const unitUsd = extraConnectionUnitUsd();
  const needsExtra =
    input.billingEnabled && input.plan === "agency" && input.liveConnections >= input.limit;
  const newExtra = extraConnectionsFor(input.liveConnections + 1);
  return {
    needsExtra,
    unitUsd,
    currentExtra: input.currentExtra,
    newExtra,
    monthlyUsd: newExtra * unitUsd,
  };
}
