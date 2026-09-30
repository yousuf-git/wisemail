import "server-only";

import { Types } from "mongoose";
import type Stripe from "stripe";

import { CREDIT_PACK_CREDITS, MAX_PACKS_PER_PURCHASE } from "@/lib/billing/stripe-prices";
import { connectDb } from "@/lib/db/connect";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { StripeEventModel } from "@/lib/db/models/stripe-events";
import { withTransaction } from "@/lib/db/transaction";
import { writeAuditLog } from "./audit";
import { findOrgByCustomer, markInvoicePaid, markPaymentFailed } from "./billing";

/**
 * Events on `/api/billing/stripe-webhook` (STRIPE_BILLING_WEBHOOK_SECRET): what the Better Auth
 * Stripe plugin does not handle. Subscribe the endpoint to `checkout.session.completed`,
 * `checkout.session.async_payment_succeeded`, `invoice.payment_failed` and `invoice.paid`.
 *
 * Every event id is stored once processed, so Stripe's retries and replays change nothing. The
 * credit-pack grant is additionally keyed by the Checkout session (`pack:<id>`) and written in
 * the same transaction as the balance, so a session pays out exactly once even if it arrives as
 * both `completed` and `async_payment_succeeded`.
 */

export type BillingEventOutcome =
  | { status: "processed"; detail?: string }
  | { status: "duplicate" }
  | { status: "ignored"; reason?: string };

const isDuplicateKey = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

async function record(eventId: string, type: string, orgId: Types.ObjectId | null) {
  try {
    await StripeEventModel.create({ eventId, type, orgId });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
}

const oid = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{24}$/i.test(value) ? new Types.ObjectId(value) : null;

/** Credits a credit-pack Checkout session grants, or `null` when it is not one of ours. */
export function creditsOfSession(session: Stripe.Checkout.Session): number | null {
  if (session.mode !== "payment" || session.metadata?.kind !== "credit_pack") return null;
  const credits = Number(session.metadata.credits);
  if (
    !Number.isInteger(credits) ||
    credits <= 0 ||
    credits % CREDIT_PACK_CREDITS !== 0 ||
    credits > CREDIT_PACK_CREDITS * MAX_PACKS_PER_PURCHASE
  ) {
    return null;
  }
  return credits;
}

async function grantCreditPack(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<BillingEventOutcome> {
  const credits = creditsOfSession(session);
  if (credits === null) return { status: "ignored", reason: "not_a_credit_pack" };
  if (session.payment_status !== "paid") {
    // Delayed payment methods: `async_payment_succeeded` grants it later.
    return { status: "ignored", reason: "unpaid" };
  }
  const orgId = oid(session.metadata?.orgId);
  if (!orgId) return { status: "ignored", reason: "no_org" };
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (customerId) {
    const owner = await findOrgByCustomer(customerId);
    // The session must belong to the customer of the org it claims to credit.
    if (owner && !owner.equals(orgId)) return { status: "ignored", reason: "org_mismatch" };
  }

  try {
    return await withTransaction(async (tx) => {
      await StripeEventModel.create(
        [{ eventId: `pack:${session.id}`, type: "credit_pack", orgId }],
        { session: tx },
      );
      await StripeEventModel.create([{ eventId: event.id, type: event.type, orgId }], {
        session: tx,
      });
      const res = await OrgSettingsModel.updateOne(
        { orgId },
        { $inc: { "aiCredits.packBalance": credits } },
        { session: tx, timestamps: false },
      );
      if (res.matchedCount === 0) throw new Error("org_settings missing for credit pack grant");
      await writeAuditLog(
        {
          orgId,
          actor: { type: "system" },
          action: "billing.credit_pack_purchased",
          target: { type: "organization", id: orgId },
          changes: { after: { credits, checkoutSessionId: session.id } },
        },
        { session: tx },
      );
      return { status: "processed", detail: `granted ${credits} credits` } as const;
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      // Same session or same event again: already paid out.
      await record(event.id, event.type, orgId);
      return { status: "duplicate" };
    }
    throw error;
  }
}

function customerOf(obj: { customer?: string | { id: string } | null }) {
  return typeof obj.customer === "string" ? obj.customer : (obj.customer?.id ?? "");
}

export async function processBillingEvent(event: Stripe.Event): Promise<BillingEventOutcome> {
  await connectDb();
  await StripeEventModel.init();
  if (await StripeEventModel.exists({ eventId: event.id })) return { status: "duplicate" };

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return grantCreditPack(event, event.data.object);
    case "invoice.payment_failed": {
      const orgId = await findOrgByCustomer(customerOf(event.data.object));
      if (!orgId) return { status: "ignored", reason: "unknown_customer" };
      await markPaymentFailed(orgId, { id: event.data.object.id ?? event.id }, new Date());
      await record(event.id, event.type, orgId);
      return { status: "processed" };
    }
    case "invoice.paid": {
      const orgId = await findOrgByCustomer(customerOf(event.data.object));
      if (!orgId) return { status: "ignored", reason: "unknown_customer" };
      await markInvoicePaid(orgId);
      await record(event.id, event.type, orgId);
      return { status: "processed" };
    }
    default:
      return { status: "ignored", reason: "unhandled_type" };
  }
}
