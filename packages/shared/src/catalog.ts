/**
 * Public catalog DTO returned by `GET /api/v1/catalog` (pricing, billing UI, entitlements).
 */

import type { Plan, PlanCatalogEntry, PlanFeatures, PlanLimits } from "./plans.js";
import type { AiFeature } from "./ai.js";

export type CatalogPlan = PlanCatalogEntry & {
  /** Stripe price ids (empty string when unset / fake mode). */
  stripePriceIds: {
    monthly: string | null;
    annual: string | null;
    overage: string | null;
  };
};

export type PlatformCatalog = {
  plans: CatalogPlan[];
  trial: { days: number; aiCredits: number };
  free: { graceDays: number; overAllowanceRetentionDays: number };
  retentionNoticeDays: number;
  paymentGraceDays: number;
  usageThresholds: readonly number[];
  creditPack: {
    credits: number;
    priceUsd: number;
    maxPacks: number;
    stripePriceId: string | null;
  };
  ai: {
    creditCost: Record<AiFeature, number>;
    model: string | null;
    modelFast: string | null;
    baseUrl: string | null;
  };
  systemEmail: { fromEmail: string | null };
  flags: {
    billingEnabled: boolean;
    googleSignIn: boolean;
    githubSignIn: boolean;
    aiEnabled: boolean;
  };
  /** Monotonic revision for client cache busting. */
  revision: number;
};

export type { Plan, PlanCatalogEntry, PlanFeatures, PlanLimits };
