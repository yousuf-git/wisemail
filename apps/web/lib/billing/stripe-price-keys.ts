/**
 * Stripe price keys: pure data and helpers (no environment access), shared by the app and the
 * build-time `scripts/check-env.ts`. Price ids themselves come from `STRIPE_PRICE_<KEY>`, see
 * `lib/billing/stripe-prices.ts` for what has to exist in Stripe.
 */

export const PAID_PLANS = ["pro", "team", "agency"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type BillingInterval = "month" | "year";

export const isPaidPlan = (value: string): value is PaidPlan =>
  (PAID_PLANS as readonly string[]).includes(value);

/** AI credits in one pack and its price (PRICING §3 "AI credits"). */
export const CREDIT_PACK_CREDITS = 1_000;
export const CREDIT_PACK_PRICE_USD = 5;
/** Most packs one Checkout purchase may contain. */
export const MAX_PACKS_PER_PURCHASE = 10;
/** One overage meter unit is this many tracked emails (the tier rate is per unit). */
export const OVERAGE_UNIT_EMAILS = 10_000;

export type PriceKey =
  | `${Uppercase<PaidPlan>}_${"MONTHLY" | "ANNUAL"}`
  | `EXTRA_CONNECTION_${"MONTHLY" | "ANNUAL"}`
  | `OVERAGE_${Uppercase<PaidPlan>}`
  | "CREDIT_PACK";

const suffix = (interval: BillingInterval) => (interval === "year" ? "ANNUAL" : "MONTHLY");

export const planPriceKey = (plan: PaidPlan, interval: BillingInterval): PriceKey =>
  `${plan.toUpperCase() as Uppercase<PaidPlan>}_${suffix(interval)}`;
export const extraConnectionPriceKey = (interval: BillingInterval): PriceKey =>
  `EXTRA_CONNECTION_${suffix(interval)}`;
export const overagePriceKey = (plan: PaidPlan): PriceKey =>
  `OVERAGE_${plan.toUpperCase() as Uppercase<PaidPlan>}`;

/** Every price the live integration needs (checked at build time by `scripts/check-env.ts`). */
export const REQUIRED_PRICE_KEYS: readonly PriceKey[] = [
  ...PAID_PLANS.flatMap((p) => [planPriceKey(p, "month"), planPriceKey(p, "year")]),
  extraConnectionPriceKey("month"),
  extraConnectionPriceKey("year"),
  ...PAID_PLANS.map(overagePriceKey),
  "CREDIT_PACK",
];

/** Name of the Billing Meter event for a tier (the meter in Stripe must use this `event_name`). */
export const overageMeterEvent = (plan: PaidPlan) => `wisemail_overage_${plan}`;

export function fakePriceId(key: PriceKey) {
  return `price_fake_${key.toLowerCase()}`;
}

export type PriceInfo =
  | { kind: "plan"; plan: PaidPlan; interval: BillingInterval; key: PriceKey }
  | { kind: "extra_connection"; interval: BillingInterval; key: PriceKey }
  | { kind: "overage"; plan: PaidPlan; key: PriceKey }
  | { kind: "credit_pack"; key: PriceKey };

export function describeKey(key: PriceKey): PriceInfo {
  if (key === "CREDIT_PACK") return { kind: "credit_pack", key };
  if (key.startsWith("EXTRA_CONNECTION_")) {
    return {
      kind: "extra_connection",
      interval: key.endsWith("ANNUAL") ? "year" : "month",
      key,
    };
  }
  if (key.startsWith("OVERAGE_")) {
    return { kind: "overage", plan: key.slice("OVERAGE_".length).toLowerCase() as PaidPlan, key };
  }
  const [plan, which] = key.split("_") as [string, string];
  return {
    kind: "plan",
    plan: plan.toLowerCase() as PaidPlan,
    interval: which === "ANNUAL" ? "year" : "month",
    key,
  };
}
