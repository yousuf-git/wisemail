import type { FastifyPluginAsync } from "fastify";

import { getStripe, webhookSecrets } from "@/lib/billing/stripe";
import { env } from "@/lib/env";
import { processBillingEvent } from "@/lib/services/billing-webhook";

const MAX_BYTES = 512 * 1024;

export const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: MAX_BYTES },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.post("/api/billing/stripe-webhook", async (request, reply) => {
    if (!env.BILLING_ENABLED) return reply.code(404).send({ error: "billing_disabled" });

    const signature = request.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      return reply.code(400).send({ error: "missing_signature" });
    }

    const rawBody = typeof request.body === "string" ? request.body : "";
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BYTES) {
      return reply.code(413).send({ error: "too_large" });
    }

    let event;
    try {
      event = await getStripe().webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecrets().billing,
      );
    } catch {
      return reply.code(400).send({ error: "invalid_signature" });
    }

    try {
      const outcome = await processBillingEvent(event);
      return reply.send({ received: true, ...outcome });
    } catch (error) {
      console.error(`[billing] webhook ${event.type} (${event.id}) failed`, error);
      return reply.code(500).send({ error: "processing_failed" });
    }
  });
};
