import "server-only";

import Stripe from "stripe";

import { env } from "@/lib/env";
import { FakeStripe } from "./stripe-fake";

/**
 * The one door to Stripe. `STRIPE_MODE=live` returns the real SDK client; `fake` returns an
 * in-memory stand-in that implements the subset of the SDK the app and the Better Auth Stripe
 * plugin use (`lib/billing/stripe-fake.ts`), so services never branch on the mode. Only
 * `BILLING_ENABLED=true` ever calls it.
 */

export const stripeIsFake = () => env.STRIPE_MODE === "fake";

const globalForStripe = globalThis as unknown as { __wisemailStripe?: Stripe };

export function getStripe(): Stripe {
  if (globalForStripe.__wisemailStripe) return globalForStripe.__wisemailStripe;
  const client =
    env.STRIPE_MODE === "fake"
      ? (new FakeStripe() as unknown as Stripe)
      : new Stripe(env.STRIPE_SECRET_KEY!, {
          maxNetworkRetries: 2,
          appInfo: { name: "Wisemail" },
        });
  globalForStripe.__wisemailStripe = client;
  return client;
}

/**
 * Signing secrets of the two webhook endpoints: the Better Auth plugin's
 * (`/api/auth/stripe/webhook`, subscriptions) and ours (`/api/billing/stripe-webhook`, credit
 * packs and invoices). Fake mode has fixed development secrets.
 */
export function webhookSecrets() {
  return {
    plugin: env.STRIPE_WEBHOOK_SECRET ?? "whsec_fake_plugin_wisemail_dev",
    billing: env.STRIPE_BILLING_WEBHOOK_SECRET ?? "whsec_fake_billing_wisemail_dev",
  };
}
