import "server-only";

import { Types } from "mongoose";

import { getStripe } from "@/lib/billing/stripe";
import { connectDb } from "@/lib/db/connect";
import { PriceChangeModel } from "@/lib/db/models/price-change";
import { listOrgsForPriceMigration } from "@/lib/services/price-changes";

/**
 * Walks orgs with Stripe subscriptions and schedules a switch from `oldStripePriceId` to
 * `newStripePriceId` at each subscription's next period end (Stripe subscription schedules).
 */

const BATCH = 50;

function priceIdOf(item: { price?: { id?: string } | string | null }): string | null {
  if (!item.price) return null;
  return typeof item.price === "string" ? item.price : (item.price.id ?? null);
}

export async function migratePriceChange(priceChangeId: string): Promise<{
  migrated: number;
  failed: number;
  done: boolean;
}> {
  await connectDb();
  const change = await PriceChangeModel.findById(priceChangeId);
  if (!change) throw new Error(`[price-migration] unknown change ${priceChangeId}`);
  if (change.status === "done") {
    return { migrated: change.migratedCount, failed: change.failedCount, done: true };
  }

  await PriceChangeModel.updateOne(
    { _id: change._id, status: { $in: ["pending", "migrating"] } },
    { $set: { status: "migrating", lastError: null } },
  );

  const stripe = getStripe();
  let migrated = 0;
  let failed = 0;
  let cursor: Types.ObjectId | undefined;
  let scanned = 0;

  for (;;) {
    const batch = await listOrgsForPriceMigration(change.oldStripePriceId, cursor);
    if (batch.length === 0) break;
    scanned += batch.length;
    cursor = batch[batch.length - 1]!._id as Types.ObjectId;

    for (const org of batch) {
      const subId = org.stripeSubscriptionId;
      if (!subId) continue;
      if (org.plan !== change.plan) continue;
      if (org.billingInterval && org.billingInterval !== change.interval) continue;

      try {
        const sub = await stripe.subscriptions.retrieve(subId);
        const items = sub.items?.data ?? [];
        const planItem = items.find((item) => priceIdOf(item) === change.oldStripePriceId);
        if (!planItem) continue;

        const periodStart = planItem.current_period_start;
        const periodEnd = planItem.current_period_end;
        if (!periodStart || !periodEnd) {
          failed += 1;
          continue;
        }

        const otherItems = items
          .filter((item) => item.id !== planItem.id)
          .map((item) => ({
            price: priceIdOf(item)!,
            quantity: item.quantity ?? 1,
          }));

        // Stripe's Phase typings are stricter than the runtime API we need here.
        await stripe.subscriptionSchedules.create({
          from_subscription: subId,
          end_behavior: "release",
          phases: [
            {
              start_date: periodStart,
              end_date: periodEnd,
              items: items.map((item) => ({
                price: priceIdOf(item)!,
                quantity: item.quantity ?? undefined,
              })),
            },
            {
              start_date: periodEnd,
              items: [
                { price: change.newStripePriceId, quantity: planItem.quantity ?? 1 },
                ...otherItems,
              ],
            },
          ] as never,
          metadata: {
            wisemail_price_change: priceChangeId,
            wisemail_org: org.orgId.toHexString(),
          },
        });
        migrated += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `[price-migration] sub ${subId} failed`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (batch.length < BATCH) break;
    if (scanned >= 5_000) break;
  }

  const totalMigrated = change.migratedCount + migrated;
  const totalFailed = change.failedCount + failed;
  const done = scanned < 5_000;
  await PriceChangeModel.updateOne(
    { _id: change._id },
    {
      $set: {
        migratedCount: totalMigrated,
        failedCount: totalFailed,
        status: done ? "done" : "migrating",
        completedAt: done ? new Date() : null,
        lastError: failed > 0 ? `${failed} subscription(s) failed in the last pass` : null,
      },
    },
  );

  return { migrated: totalMigrated, failed: totalFailed, done };
}
