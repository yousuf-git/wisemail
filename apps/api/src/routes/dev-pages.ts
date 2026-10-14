import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { FastifyPluginAsync } from "fastify";

import { stripeIsFake } from "@/lib/billing/stripe";
import {
  applyPortalAction,
  cancelCheckout,
  completeCheckout,
  fakeStore,
  type PortalAction,
} from "@/lib/billing/stripe-fake";
import { fakePriceCatalog } from "@/lib/billing/stripe-prices";
import { env } from "@/lib/env";
import { OUTBOX_DIR, getOutbox, systemEmailIsFake } from "@/lib/services/system-email";

type OutboxRow = {
  id: string;
  kind: string;
  to: string;
  subject: string;
  link: string | null;
  code?: string | null;
  sentAt: string;
  html?: string;
};

async function loadOutboxRows(): Promise<OutboxRow[]> {
  const rows = new Map<string, OutboxRow>();
  try {
    for (const name of await readdir(OUTBOX_DIR)) {
      if (!name.endsWith(".json")) continue;
      const meta = JSON.parse(await readFile(path.join(OUTBOX_DIR, name), "utf8")) as OutboxRow & {
        file: string;
      };
      const html = await readFile(path.join(OUTBOX_DIR, meta.file), "utf8").catch(() => undefined);
      rows.set(meta.id, { ...meta, html });
    }
  } catch {
    /* empty dir */
  }
  for (const m of getOutbox()) if (!rows.has(m.id)) rows.set(m.id, m);
  return [...rows.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 200);
}

const PORTAL_ACTIONS: PortalAction[] = ["cancel", "resume", "fail_payment", "pay", "confirm_update"];

/**
 * Dev-only JSON for SPA `/dev/outbox` and `/dev/stripe/*` (fake Resend / Stripe).
 * 404 in production or when the matching fake mode is off.
 */
export const devPagesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/dev/outbox", async (_req, reply) => {
    if (env.NODE_ENV === "production" || !systemEmailIsFake()) {
      return reply.code(404).send({ error: "not_found", message: "Not found." });
    }
    return { items: await loadOutboxRows() };
  });

  app.get<{ Params: { id: string } }>("/api/dev/stripe/checkout/:id", async (req, reply) => {
    if (env.NODE_ENV === "production" || !env.BILLING_ENABLED || !stripeIsFake()) {
      return reply.code(404).send({ error: "not_found", message: "Not found." });
    }
    const session = fakeStore().sessions.get(req.params.id);
    if (!session) return reply.code(404).send({ error: "not_found", message: "Not found." });
    const catalog = fakePriceCatalog();
    return {
      session: {
        id: session.id,
        mode: session.mode,
        status: session.status,
        amount_total: session.amount_total,
        line_items: session.line_items.map((li) => {
          const row = catalog.find((p) => p.id === li.price);
          return {
            price: li.price,
            quantity: li.quantity,
            label: row?.label ?? li.price,
            unitAmount: row?.unitAmount ?? 0,
            metered: row?.metered ?? false,
          };
        }),
      },
    };
  });

  app.post<{ Params: { id: string } }>("/api/dev/stripe/checkout/:id/pay", async (req, reply) => {
    if (env.NODE_ENV === "production" || !env.BILLING_ENABLED || !stripeIsFake()) {
      return reply.code(404).send({ error: "not_found", message: "Not found." });
    }
    try {
      return await completeCheckout(req.params.id);
    } catch (e) {
      return reply
        .code(400)
        .send({ error: "validation", message: e instanceof Error ? e.message : "Pay failed." });
    }
  });

  app.post<{ Params: { id: string } }>("/api/dev/stripe/checkout/:id/cancel", async (req, reply) => {
    if (env.NODE_ENV === "production" || !env.BILLING_ENABLED || !stripeIsFake()) {
      return reply.code(404).send({ error: "not_found", message: "Not found." });
    }
    return cancelCheckout(req.params.id);
  });

  app.get<{ Params: { id: string } }>("/api/dev/stripe/portal/:id", async (req, reply) => {
    if (env.NODE_ENV === "production" || !env.BILLING_ENABLED || !stripeIsFake()) {
      return reply.code(404).send({ error: "not_found", message: "Not found." });
    }
    const store = fakeStore();
    const portal = store.portals.get(req.params.id);
    if (!portal) return reply.code(404).send({ error: "not_found", message: "Not found." });
    const sub = [...store.subscriptions.values()].find(
      (s) => s.customer === portal.customer && s.status !== "canceled",
    );
    const catalog = fakePriceCatalog();
    return {
      portal: {
        id: portal.id,
        return_url: portal.return_url,
        flow: (portal.flow?.type as string | undefined) ?? null,
      },
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            items: sub.items.data.map((item) => ({
              id: item.id,
              priceId: item.price.id,
              label: catalog.find((p) => p.id === item.price.id)?.label ?? item.price.id,
              quantity: item.quantity,
            })),
          }
        : null,
    };
  });

  app.post<{ Params: { id: string }; Body: { action?: string } }>(
    "/api/dev/stripe/portal/:id/action",
    async (req, reply) => {
      if (env.NODE_ENV === "production" || !env.BILLING_ENABLED || !stripeIsFake()) {
        return reply.code(404).send({ error: "not_found", message: "Not found." });
      }
      const action = String(req.body?.action ?? "") as PortalAction;
      if (!PORTAL_ACTIONS.includes(action)) {
        return reply.code(400).send({ error: "validation", message: "Unknown portal action." });
      }
      try {
        return await applyPortalAction(req.params.id, action);
      } catch (e) {
        return reply
          .code(400)
          .send({ error: "validation", message: e instanceof Error ? e.message : "Action failed." });
      }
    },
  );
};
