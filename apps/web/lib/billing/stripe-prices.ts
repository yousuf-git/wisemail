import "server-only";

import { PLAN_CATALOG } from "@/lib/billing/plans";
import { env } from "@/lib/env";
import { ServiceError } from "@/lib/services/errors";
import {
  CREDIT_PACK_CREDITS,
  CREDIT_PACK_PRICE_USD,
  REQUIRED_PRICE_KEYS,
  describeKey,
  fakePriceId,
  type BillingInterval,
  type PriceInfo,
  type PriceKey,
} from "./stripe-price-keys";

/**
 * Stripe price catalog for Wisemail (PRICING §3, TRD §2.10). One environment variable per price,
 * `STRIPE_PRICE_<KEY>`; in fake mode a missing variable falls back to `price_fake_<key>` so the
 * whole flow runs without a Stripe account.
 *
 * What has to exist in Stripe (create these in the dashboard, test mode first):
 * - plan prices: Pro / Team / Agency, monthly and annual (per-year amount), licensed;
 * - extra connection (Agency): $5/month and an annual counterpart, licensed, quantity-based;
 * - overage, one metered price per tier: $1 / $0.75 / $0.50 per unit, where one unit is 10,000
 *   tracked emails, monthly, attached to a Billing Meter whose `event_name` is
 *   `overageMeterEvent(plan)` (aggregation `sum`, customer mapping `stripe_customer_id`);
 * - credit pack: one-time $5 for 1,000 credits.
 */

export {
  CREDIT_PACK_CREDITS,
  CREDIT_PACK_PRICE_USD,
  MAX_PACKS_PER_PURCHASE,
  OVERAGE_UNIT_EMAILS,
  PAID_PLANS,
  REQUIRED_PRICE_KEYS,
  describeKey,
  extraConnectionPriceKey,
  fakePriceId,
  isPaidPlan,
  overageMeterEvent,
  overagePriceKey,
  planPriceKey,
  type BillingInterval,
  type PaidPlan,
  type PriceInfo,
  type PriceKey,
} from "./stripe-price-keys";

/** Price ids by key from a plain env map (build script) or the validated env. */
export function readPriceId(prices: Record<string, string>, key: PriceKey, fake: boolean) {
  return prices[`STRIPE_PRICE_${key}`] ?? (fake ? fakePriceId(key) : undefined);
}

export function priceId(key: PriceKey): string {
  const id = readPriceId(env.STRIPE_PRICES, key, env.STRIPE_MODE === "fake");
  if (!id) {
    throw new ServiceError(
      "billing_unavailable",
      "Billing isn't fully set up yet. Please contact support.",
    );
  }
  return id;
}

/** What a Stripe price id stands for, or `null` for prices we do not know. */
export function describePrice(id: string): PriceInfo | null {
  for (const key of REQUIRED_PRICE_KEYS) {
    if (readPriceId(env.STRIPE_PRICES, key, env.STRIPE_MODE === "fake") !== id) continue;
    return describeKey(key);
  }
  return null;
}

/** Catalog data the fake Stripe serves for `prices.retrieve` and shows on its checkout page. */
export function fakePriceCatalog() {
  const rows: {
    id: string;
    key: PriceKey;
    label: string;
    unitAmount: number;
    interval: BillingInterval | null;
    metered: boolean;
  }[] = [];
  for (const key of REQUIRED_PRICE_KEYS) {
    const info = describeKey(key);
    const id = readPriceId(env.STRIPE_PRICES, key, true)!;
    if (info.kind === "plan") {
      const p = PLAN_CATALOG[info.plan];
      rows.push({
        id,
        key,
        label: `${p.label} (${info.interval === "year" ? "yearly" : "monthly"})`,
        unitAmount:
          info.interval === "year" ? p.priceAnnualPerMonth * 12 * 100 : p.priceMonthly * 100,
        interval: info.interval,
        metered: false,
      });
    } else if (info.kind === "extra_connection") {
      const unit = PLAN_CATALOG.agency.extraConnectionUsd ?? 5;
      rows.push({
        id,
        key,
        label: `Extra connection (${info.interval === "year" ? "yearly" : "monthly"})`,
        unitAmount: (info.interval === "year" ? unit * 12 : unit) * 100,
        interval: info.interval,
        metered: false,
      });
    } else if (info.kind === "overage") {
      const rate = PLAN_CATALOG[info.plan].overagePer10kUsd ?? 0;
      rows.push({
        id,
        key,
        label: `${PLAN_CATALOG[info.plan].label} overage per 10k emails`,
        unitAmount: Math.round(rate * 100),
        interval: "month",
        metered: true,
      });
    } else {
      rows.push({
        id,
        key,
        label: `AI credit pack (${CREDIT_PACK_CREDITS.toLocaleString("en-US")} credits)`,
        unitAmount: CREDIT_PACK_PRICE_USD * 100,
        interval: null,
        metered: false,
      });
    }
  }
  return rows;
}
