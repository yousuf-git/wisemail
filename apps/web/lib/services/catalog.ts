import "server-only";

import type { PlatformCatalog, CatalogPlan } from "@wisemail/shared/catalog";
import {
  DEFAULT_AI_CREDIT_COST,
  type AiFeature,
} from "@wisemail/shared/ai";
import {
  DEFAULT_PLAN_CATALOG,
  FREE_GRACE_DAYS,
  FREE_OVER_ALLOWANCE_RETENTION_DAYS,
  PAYMENT_GRACE_DAYS,
  PLAN_ORDER,
  RETENTION_NOTICE_DAYS,
  TRIAL_AI_CREDITS,
  TRIAL_DAYS,
  USAGE_THRESHOLDS,
  type Plan,
  type PlanCatalog,
} from "@wisemail/shared/plans";
import {
  CREDIT_PACK_CREDITS,
  CREDIT_PACK_PRICE_USD,
  MAX_PACKS_PER_PURCHASE,
  REQUIRED_PRICE_KEYS,
  describeKey,
  fakePriceId,
  stripeLookupKey,
  type PriceKey,
} from "@wisemail/shared/stripe-prices";

import { connectDb } from "@/lib/db/connect";
import { PlanModel } from "@/lib/db/models/plan";
import {
  PLATFORM_SETTINGS_KEY,
  PlatformSettingsModel,
} from "@/lib/db/models/platform-settings";
import { env } from "@/lib/env";

type Cache = { at: number; catalog: PlatformCatalog; planCatalog: PlanCatalog };

const TTL_MS = 5_000;
let cache: Cache | null = null;

/** Drop the in-process catalog cache (admin writes, tests). */
export function invalidateCatalogCache() {
  cache = null;
}

function stripeIdFromEnv(key: PriceKey): string | null {
  return env.STRIPE_PRICES[`STRIPE_PRICE_${key}`] ?? null;
}

async function seedIfEmpty() {
  const [planCount, settings] = await Promise.all([
    PlanModel.countDocuments(),
    PlatformSettingsModel.findOne({ key: PLATFORM_SETTINGS_KEY }).lean(),
  ]);

  if (planCount === 0) {
    try {
      await PlanModel.insertMany(
        PLAN_ORDER.map((id, sortOrder) => {
          const p = DEFAULT_PLAN_CATALOG[id];
          return {
            _id: id,
            label: p.label,
            tagline: p.tagline,
            priceMonthly: p.priceMonthly,
            priceAnnualPerMonth: p.priceAnnualPerMonth,
            limits: p.limits,
            features: p.features,
            overagePer10kUsd: p.overagePer10kUsd,
            extraConnectionUsd: p.extraConnectionUsd,
            support: p.support,
            sortOrder,
            stripe: {
              priceMonthlyId:
                id === "free" ? null : stripeIdFromEnv(`${id.toUpperCase()}_MONTHLY` as PriceKey),
              priceAnnualId:
                id === "free" ? null : stripeIdFromEnv(`${id.toUpperCase()}_ANNUAL` as PriceKey),
              overagePriceId:
                id === "free" ? null : stripeIdFromEnv(`OVERAGE_${id.toUpperCase()}` as PriceKey),
              productId: null,
              lookupMonthly:
                id === "free" ? null : stripeLookupKey(`${id.toUpperCase()}_MONTHLY` as PriceKey),
              lookupAnnual:
                id === "free" ? null : stripeLookupKey(`${id.toUpperCase()}_ANNUAL` as PriceKey),
              lookupOverage:
                id === "free" ? null : stripeLookupKey(`OVERAGE_${id.toUpperCase()}` as PriceKey),
            },
          };
        }),
      );
    } catch (error) {
      // Concurrent first-read seed (tests / multi-instance).
      if (!isDuplicateKey(error)) throw error;
    }
  }

  if (!settings) {
    const stripePriceIds = new Map<string, string>();
    for (const key of REQUIRED_PRICE_KEYS) {
      const id = stripeIdFromEnv(key);
      if (id) stripePriceIds.set(key, id);
    }
    try {
      await PlatformSettingsModel.create({
        key: PLATFORM_SETTINGS_KEY,
        trialDays: TRIAL_DAYS,
        trialAiCredits: TRIAL_AI_CREDITS,
        freeGraceDays: FREE_GRACE_DAYS,
        freeOverAllowanceRetentionDays: FREE_OVER_ALLOWANCE_RETENTION_DAYS,
        retentionNoticeDays: RETENTION_NOTICE_DAYS,
        paymentGraceDays: PAYMENT_GRACE_DAYS,
        usageThresholds: [...USAGE_THRESHOLDS],
        creditPack: {
          credits: CREDIT_PACK_CREDITS,
          priceUsd: CREDIT_PACK_PRICE_USD,
          maxPacks: MAX_PACKS_PER_PURCHASE,
          stripePriceId: stripeIdFromEnv("CREDIT_PACK"),
          stripeLookupKey: stripeLookupKey("CREDIT_PACK"),
        },
        aiCreditCost: { ...DEFAULT_AI_CREDIT_COST },
        aiModel: env.AI_MODEL ?? null,
        aiModelFast: env.AI_MODEL_FAST ?? null,
        aiBaseUrl: env.AI_BASE_URL ?? null,
        systemFromEmail: env.SYSTEM_FROM_EMAIL ?? null,
        billingEnabled: env.BILLING_ENABLED,
        googleSignIn: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        githubSignIn: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
        aiEnabled: true,
        stripePriceIds,
        revision: 1,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

function toPlanCatalog(plans: CatalogPlan[]): PlanCatalog {
  const out = { ...DEFAULT_PLAN_CATALOG };
  for (const p of plans) {
    out[p.id] = {
      id: p.id,
      label: p.label,
      tagline: p.tagline,
      priceMonthly: p.priceMonthly,
      priceAnnualPerMonth: p.priceAnnualPerMonth,
      limits: p.limits,
      features: p.features,
      overagePer10kUsd: p.overagePer10kUsd,
      extraConnectionUsd: p.extraConnectionUsd,
      support: p.support,
    };
  }
  return out;
}

/**
 * Loads platform catalog from Mongo (seeds defaults on first use). Short-lived process cache.
 */
export async function getPlatformCatalog(): Promise<PlatformCatalog> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.catalog;

  await connectDb();
  await seedIfEmpty();
  await backfillLookupKeys();

  const [planRows, settings] = await Promise.all([
    PlanModel.find().sort({ sortOrder: 1 }).lean(),
    PlatformSettingsModel.findOne({ key: PLATFORM_SETTINGS_KEY }).lean(),
  ]);

  if (!settings) throw new Error("[catalog] platform_settings missing after seed");

  const plans: CatalogPlan[] = planRows.map((row) => {
    const id = row._id as Plan;
    const monthlyKey = id === "free" ? null : (`${id.toUpperCase()}_MONTHLY` as PriceKey);
    const annualKey = id === "free" ? null : (`${id.toUpperCase()}_ANNUAL` as PriceKey);
    const overageKey = id === "free" ? null : (`OVERAGE_${id.toUpperCase()}` as PriceKey);
    return {
      id,
      label: row.label,
      tagline: row.tagline,
      priceMonthly: row.priceMonthly,
      priceAnnualPerMonth: row.priceAnnualPerMonth,
      limits: row.limits as CatalogPlan["limits"],
      features: row.features as CatalogPlan["features"],
      overagePer10kUsd: row.overagePer10kUsd ?? null,
      extraConnectionUsd: row.extraConnectionUsd ?? null,
      support: row.support,
      stripePriceIds: {
        monthly: row.stripe?.priceMonthlyId ?? (monthlyKey ? stripeIdFromEnv(monthlyKey) : null),
        annual: row.stripe?.priceAnnualId ?? (annualKey ? stripeIdFromEnv(annualKey) : null),
        overage: row.stripe?.overagePriceId ?? (overageKey ? stripeIdFromEnv(overageKey) : null),
      },
      stripeLookupKeys: {
        monthly: row.stripe?.lookupMonthly ?? (monthlyKey ? stripeLookupKey(monthlyKey) : null),
        annual: row.stripe?.lookupAnnual ?? (annualKey ? stripeLookupKey(annualKey) : null),
        overage: row.stripe?.lookupOverage ?? (overageKey ? stripeLookupKey(overageKey) : null),
      },
    };
  });

  const priceMap = settings.stripePriceIds;
  const creditPackStripe =
    settings.creditPack.stripePriceId ??
    (priceMap instanceof Map
      ? (priceMap.get("CREDIT_PACK") ?? null)
      : ((priceMap as Record<string, string> | undefined)?.CREDIT_PACK ?? null)) ??
    stripeIdFromEnv("CREDIT_PACK");

  const catalog: PlatformCatalog = {
    plans,
    trial: { days: settings.trialDays, aiCredits: settings.trialAiCredits },
    free: {
      graceDays: settings.freeGraceDays,
      overAllowanceRetentionDays: settings.freeOverAllowanceRetentionDays,
    },
    retentionNoticeDays: settings.retentionNoticeDays,
    paymentGraceDays: settings.paymentGraceDays,
    usageThresholds: settings.usageThresholds,
    creditPack: {
      credits: settings.creditPack.credits,
      priceUsd: settings.creditPack.priceUsd,
      maxPacks: settings.creditPack.maxPacks,
      stripePriceId: creditPackStripe,
      stripeLookupKey: settings.creditPack.stripeLookupKey ?? stripeLookupKey("CREDIT_PACK"),
    },
    ai: {
      creditCost: settings.aiCreditCost as Record<AiFeature, number>,
      model: settings.aiModel ?? null,
      modelFast: settings.aiModelFast ?? null,
      baseUrl: settings.aiBaseUrl ?? null,
    },
    systemEmail: { fromEmail: settings.systemFromEmail ?? null },
    flags: {
      billingEnabled: settings.billingEnabled,
      googleSignIn: settings.googleSignIn,
      githubSignIn: settings.githubSignIn,
      aiEnabled: settings.aiEnabled,
    },
    revision: settings.revision,
  };

  cache = { at: Date.now(), catalog, planCatalog: toPlanCatalog(plans) };
  return catalog;
}

/** Plan catalog map for entitlements / helpers (DB-backed, seeded). */
export async function getPlanCatalog(): Promise<PlanCatalog> {
  await getPlatformCatalog();
  return cache!.planCatalog;
}

/** Synchronous fallback for pure code paths that have not loaded the DB yet. */
export function defaultPlanCatalog(): PlanCatalog {
  return DEFAULT_PLAN_CATALOG;
}

/** Resolve a Stripe price id from the cached catalog (DB), else env / fake. */
export function priceIdFromCatalog(key: PriceKey, catalog?: PlatformCatalog | null): string | null {
  const c = catalog ?? cache?.catalog ?? null;
  if (c) {
    const info = describeKey(key);
    if (info.kind === "credit_pack") {
      return c.creditPack.stripePriceId;
    }
    if (info.kind === "plan") {
      const plan = c.plans.find((p) => p.id === info.plan);
      if (!plan) return null;
      return info.interval === "year" ? plan.stripePriceIds.annual : plan.stripePriceIds.monthly;
    }
    if (info.kind === "overage") {
      return c.plans.find((p) => p.id === info.plan)?.stripePriceIds.overage ?? null;
    }
    // Extra connection prices stay on platform_settings.stripePriceIds / env for now.
  }
  return stripeIdFromEnv(key) ?? (env.STRIPE_MODE === "fake" ? fakePriceId(key) : null);
}

/** Ensure catalog is loaded, then resolve a price id. */
export async function resolveCatalogPriceId(key: PriceKey): Promise<string | null> {
  const catalog = await getPlatformCatalog();
  return priceIdFromCatalog(key, catalog) ?? stripeIdFromEnv(key) ?? (env.STRIPE_MODE === "fake" ? fakePriceId(key) : null);
}

async function backfillLookupKeys() {
  for (const id of PLAN_ORDER) {
    if (id === "free") continue;
    const monthly = `${id.toUpperCase()}_MONTHLY` as PriceKey;
    const annual = `${id.toUpperCase()}_ANNUAL` as PriceKey;
    const overage = `OVERAGE_${id.toUpperCase()}` as PriceKey;
    await PlanModel.updateOne(
      {
        _id: id,
        $or: [
          { "stripe.lookupMonthly": null },
          { "stripe.lookupMonthly": { $exists: false } },
        ],
      },
      {
        $set: {
          "stripe.lookupMonthly": stripeLookupKey(monthly),
          "stripe.lookupAnnual": stripeLookupKey(annual),
          "stripe.lookupOverage": stripeLookupKey(overage),
        },
      },
    );
  }

  await PlatformSettingsModel.updateOne(
    {
      key: PLATFORM_SETTINGS_KEY,
      $or: [
        { "creditPack.stripeLookupKey": null },
        { "creditPack.stripeLookupKey": { $exists: false } },
      ],
    },
    { $set: { "creditPack.stripeLookupKey": stripeLookupKey("CREDIT_PACK") } },
  );
}
