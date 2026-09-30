import { getStripe, webhookSecrets } from "@/lib/billing/stripe";
import { env } from "@/lib/env";
import { processBillingEvent } from "@/lib/services/billing-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 512 * 1024;

/**
 * Stripe webhook for what the Better Auth plugin does not handle: credit packs
 * (`checkout.session.completed`) and invoices (`invoice.payment_failed`, `invoice.paid`), see
 * `lib/services/billing-webhook.ts`. The raw body is verified against STRIPE_BILLING_WEBHOOK_SECRET
 * before anything is parsed; a bad or missing signature answers 400. Processing is idempotent by
 * event id, so a 5xx (Stripe retries) is always safe.
 */
export async function POST(request: Request) {
  if (!env.BILLING_ENABLED) return Response.json({ error: "billing_disabled" }, { status: 404 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing_signature" }, { status: 400 });

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  let event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecrets().billing,
    );
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const outcome = await processBillingEvent(event);
    return Response.json({ received: true, ...outcome });
  } catch (error) {
    console.error(`[billing] webhook ${event.type} (${event.id}) failed`, error);
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }
}
