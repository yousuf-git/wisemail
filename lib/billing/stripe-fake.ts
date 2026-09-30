import "server-only";

import Stripe from "stripe";

import { env } from "@/lib/env";
import { fakePriceCatalog } from "./stripe-prices";
import { webhookSecrets } from "./stripe";

/**
 * In-memory Stripe for development and tests (`STRIPE_MODE=fake`). It implements the subset of
 * the SDK that Wisemail and the Better Auth Stripe plugin call, with the same shapes, so the
 * real code paths run end to end without api.stripe.com:
 *
 * - customers, subscriptions (items, quantity, cancel at period end), prices, Billing Meter
 *   events (idempotent by `identifier`), Checkout sessions (subscription and payment mode) and
 *   Customer Portal sessions;
 * - a fake hosted Checkout and Portal (`/dev/stripe/checkout|portal/<id>`), which "pay", cancel
 *   or fail a payment and then deliver correctly signed webhook events to both endpoints
 *   (`/api/auth/stripe/webhook` and `/api/billing/stripe-webhook`) in process;
 * - webhook signatures are real: `webhooks` is the SDK's own implementation.
 *
 * The store lives on `globalThis` so every server bundle shares it; it is forgotten when the
 * server restarts (subscriptions in the database then point at ids the fake no longer knows).
 * Direct SDK calls (`subscriptions.update`, meter events) emit no webhook events on their own.
 */

type Json = Record<string, unknown>;

export type FakeItem = {
  id: string;
  price: { id: string; lookup_key: string | null; recurring: Json | null };
  quantity: number;
  current_period_start: number;
  current_period_end: number;
};

export type FakeSubscription = {
  id: string;
  object: "subscription";
  customer: string;
  status: Stripe.Subscription.Status;
  items: { object: "list"; data: FakeItem[] };
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  canceled_at: number | null;
  ended_at: number | null;
  trial_start: number | null;
  trial_end: number | null;
  metadata: Record<string, string>;
  schedule: string | null;
  cancellation_details: Json | null;
  created: number;
  billing_mode: { type: string };
};

export type FakeSession = {
  id: string;
  object: "checkout.session";
  url: string;
  mode: "subscription" | "payment" | "setup";
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid";
  customer: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string>;
  subscription: string | null;
  payment_intent: string | null;
  success_url: string;
  cancel_url: string | null;
  line_items: { price: string; quantity: number }[];
  subscription_data_metadata: Record<string, string>;
  amount_total: number;
  created: number;
};

export type FakePortal = {
  id: string;
  object: "billing_portal.session";
  url: string;
  customer: string;
  return_url: string | null;
  flow: Json | null;
};

type Store = {
  seq: number;
  customers: Map<string, Json>;
  subscriptions: Map<string, FakeSubscription>;
  sessions: Map<string, FakeSession>;
  portals: Map<string, FakePortal>;
  meterEvents: Map<string, { event_name: string; customer: string; value: number; at: number }>;
  /** Every `subscriptions.update` call, so tests can assert what would have been sent. */
  subscriptionUpdates: { id: string; params: Json }[];
  sessionCreates: Json[];
  delivered: { id: string; type: string; target: "plugin" | "billing"; status: number }[];
};

const globalForFake = globalThis as unknown as { __wisemailFakeStripe?: Store };

function fresh(): Store {
  return {
    seq: 0,
    customers: new Map(),
    subscriptions: new Map(),
    sessions: new Map(),
    portals: new Map(),
    meterEvents: new Map(),
    subscriptionUpdates: [],
    sessionCreates: [],
    delivered: [],
  };
}

export const fakeStore = (): Store => (globalForFake.__wisemailFakeStripe ??= fresh());

/** Forgets everything (tests). */
export function resetFakeStripe() {
  globalForFake.__wisemailFakeStripe = fresh();
}

const nextId = (prefix: string) =>
  `${prefix}_fake_${(++fakeStore().seq).toString(36)}${Date.now().toString(36).slice(-4)}`;
const seconds = (d: Date = new Date()) => Math.floor(d.getTime() / 1000);

export class FakeStripeError extends Error {
  readonly type = "invalid_request_error";
  constructor(
    message: string,
    readonly code: string = "invalid_request",
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "StripeInvalidRequestError";
  }
}
const missing = (what: string, id: string) =>
  new FakeStripeError(`No such ${what}: '${id}'`, "resource_missing", 404);

function priceOf(id: string): FakeItem["price"] {
  const row = fakePriceCatalog().find((p) => p.id === id);
  if (!row) throw missing("price", id);
  return {
    id,
    lookup_key: null,
    recurring: row.interval
      ? {
          interval: row.interval,
          interval_count: 1,
          usage_type: row.metered ? "metered" : "licensed",
        }
      : null,
  };
}

function addPeriod(from: Date, interval: string | undefined) {
  const d = new Date(from);
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

function makeItem(priceId: string, quantity: number, start: Date): FakeItem {
  const price = priceOf(priceId);
  return {
    id: nextId("si"),
    price,
    quantity,
    current_period_start: seconds(start),
    current_period_end: seconds(addPeriod(start, price.recurring?.interval as string | undefined)),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* SDK surface                                                                                 */
/* ------------------------------------------------------------------------------------------ */

const list = <T>(data: T[]) =>
  Object.assign(Promise.resolve({ object: "list", data, has_more: false }), {
    async *[Symbol.asyncIterator]() {
      for (const row of data) yield row;
    },
  });

const customers = {
  async create(params: Json) {
    const id = nextId("cus");
    const customer = {
      id,
      object: "customer",
      created: seconds(),
      email: null,
      name: null,
      metadata: {},
      ...params,
    };
    fakeStore().customers.set(id, customer);
    return customer;
  },
  async retrieve(id: string) {
    const c = fakeStore().customers.get(id);
    if (!c) throw missing("customer", id);
    return c;
  },
  async update(id: string, params: Json) {
    const c = await customers.retrieve(id);
    Object.assign(c, params);
    return c;
  },
  async search(params: { query: string }) {
    const org = /metadata\["organizationId"\]:"([^"]+)"/.exec(params.query)?.[1];
    const email = /email:"([^"]+)"/.exec(params.query)?.[1];
    const data = [...fakeStore().customers.values()].filter((c) => {
      const meta = (c.metadata ?? {}) as Record<string, string>;
      if (org) return meta.organizationId === org;
      if (email) return c.email === email && meta.customerType !== "organization";
      return false;
    });
    return { object: "search_result", data, has_more: false };
  },
  list(params: { email?: string } = {}) {
    return list(
      [...fakeStore().customers.values()].filter((c) => !params.email || c.email === params.email),
    );
  },
};

const prices = {
  async retrieve(id: string) {
    return { id, object: "price", active: true, recurring: priceOf(id).recurring };
  },
  async list() {
    return { object: "list", data: [], has_more: false };
  },
};

type LineItemParam = { price?: string; quantity?: number };

const checkoutSessions = {
  async create(params: Json) {
    const store = fakeStore();
    store.sessionCreates.push(params);
    const mode = (params.mode as FakeSession["mode"]) ?? "payment";
    const lineItems = ((params.line_items as LineItemParam[] | undefined) ?? []).map((li) => ({
      price: li.price!,
      quantity: li.quantity ?? 1,
    }));
    for (const li of lineItems) priceOf(li.price); // unknown price ids fail like Stripe
    const id = nextId("cs");
    const amount = lineItems.reduce((sum, li) => {
      const row = fakePriceCatalog().find((p) => p.id === li.price);
      return sum + (row && !row.metered ? row.unitAmount * li.quantity : 0);
    }, 0);
    const subData = (params.subscription_data as { metadata?: Record<string, string> } | undefined)
      ?.metadata;
    const session: FakeSession = {
      id,
      object: "checkout.session",
      url: `${env.APP_URL.replace(/\/$/, "")}/dev/stripe/checkout/${id}`,
      mode,
      status: "open",
      payment_status: "unpaid",
      customer: (params.customer as string | undefined) ?? null,
      client_reference_id: (params.client_reference_id as string | undefined) ?? null,
      metadata: (params.metadata as Record<string, string> | undefined) ?? {},
      subscription: null,
      payment_intent: null,
      success_url: (params.success_url as string) ?? "/",
      cancel_url: (params.cancel_url as string | undefined) ?? null,
      line_items: lineItems,
      subscription_data_metadata: subData ?? {},
      amount_total: amount,
      created: seconds(),
    };
    store.sessions.set(id, session);
    return session;
  },
  async retrieve(id: string) {
    const s = fakeStore().sessions.get(id);
    if (!s) throw missing("checkout.session", id);
    return s;
  },
};

const portalSessions = {
  async create(params: {
    customer: string;
    return_url?: string;
    flow_data?: Json;
    locale?: string;
  }) {
    const id = nextId("bps");
    const portal: FakePortal = {
      id,
      object: "billing_portal.session",
      url: `${env.APP_URL.replace(/\/$/, "")}/dev/stripe/portal/${id}`,
      customer: params.customer,
      return_url: params.return_url ?? null,
      flow: params.flow_data ?? null,
    };
    fakeStore().portals.set(id, portal);
    return portal;
  },
};

type ItemUpdate = {
  id?: string;
  price?: string;
  quantity?: number;
  deleted?: boolean;
};

const subscriptions = {
  async retrieve(id: string) {
    const s = fakeStore().subscriptions.get(id);
    if (!s) throw missing("subscription", id);
    return s;
  },
  list(params: { customer?: string; status?: string } = {}) {
    return list(
      [...fakeStore().subscriptions.values()].filter(
        (s) =>
          (!params.customer || s.customer === params.customer) &&
          (!params.status || params.status === "all" || s.status === params.status),
      ),
    );
  },
  async update(id: string, params: Json) {
    const sub = await subscriptions.retrieve(id);
    fakeStore().subscriptionUpdates.push({ id, params });
    for (const change of (params.items as ItemUpdate[] | undefined) ?? []) {
      if (change.id) {
        const idx = sub.items.data.findIndex((i) => i.id === change.id);
        if (idx < 0) throw missing("subscription_item", change.id);
        if (change.deleted) {
          sub.items.data.splice(idx, 1);
          continue;
        }
        const item = sub.items.data[idx]!;
        if (change.price && change.price !== item.price.id) {
          item.price = priceOf(change.price);
        }
        if (change.quantity !== undefined) item.quantity = change.quantity;
      } else if (change.price) {
        sub.items.data.push(
          makeItem(
            change.price,
            change.quantity ?? 1,
            new Date(sub.items.data[0]!.current_period_start * 1000),
          ),
        );
      }
    }
    if (params.cancel_at_period_end !== undefined) {
      sub.cancel_at_period_end = Boolean(params.cancel_at_period_end);
      sub.cancel_at = sub.cancel_at_period_end ? sub.items.data[0]!.current_period_end : null;
      sub.canceled_at = sub.cancel_at_period_end ? seconds() : null;
    }
    if (params.cancel_at === "") {
      sub.cancel_at = null;
      sub.canceled_at = null;
    }
    if (params.metadata) Object.assign(sub.metadata, params.metadata as Record<string, string>);
    return sub;
  },
};

const unsupported = (what: string) => async () => {
  throw new FakeStripeError(`${what} is not supported by the fake Stripe.`);
};
const subscriptionSchedules = {
  create: unsupported("subscriptionSchedules.create"),
  list: async () => ({ object: "list", data: [], has_more: false }),
  update: unsupported("subscriptionSchedules.update"),
  release: unsupported("subscriptionSchedules.release"),
  retrieve: unsupported("subscriptionSchedules.retrieve"),
};

const billing = {
  meterEvents: {
    async create(params: {
      event_name: string;
      payload: Record<string, string>;
      identifier?: string;
      timestamp?: number;
    }) {
      const store = fakeStore();
      const identifier = params.identifier ?? nextId("mev");
      // Duplicate identifiers are absorbed, never double counted (like Stripe within 24 hours).
      if (!store.meterEvents.has(identifier)) {
        store.meterEvents.set(identifier, {
          event_name: params.event_name,
          customer: params.payload.stripe_customer_id ?? "",
          value: Number(params.payload.value ?? 0),
          at: params.timestamp ?? seconds(),
        });
      }
      return { object: "billing.meter_event", identifier, event_name: params.event_name };
    },
  },
};

export class FakeStripe {
  readonly customers = customers;
  readonly prices = prices;
  readonly checkout = { sessions: checkoutSessions };
  readonly billingPortal = { sessions: portalSessions };
  readonly subscriptions = subscriptions;
  readonly subscriptionSchedules = subscriptionSchedules;
  readonly billing = billing;
  readonly webhooks = Stripe.webhooks;
}

/* ------------------------------------------------------------------------------------------ */
/* Webhook delivery                                                                            */
/* ------------------------------------------------------------------------------------------ */

export type WebhookTarget = "plugin" | "billing";

export const webhookPath = (target: WebhookTarget) =>
  target === "plugin" ? "/api/auth/stripe/webhook" : "/api/billing/stripe-webhook";

export function buildEvent(type: string, object: unknown, created: Date = new Date()) {
  return {
    id: nextId("evt"),
    object: "event",
    api_version: "fake",
    created: seconds(created),
    type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  } as unknown as Stripe.Event;
}

/** A signed webhook request for `event`, exactly as Stripe would send it. */
export function signedWebhookRequest(target: WebhookTarget, event: Stripe.Event, baseUrl: string) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecrets()[target],
  });
  return new Request(`${baseUrl.replace(/\/$/, "")}${webhookPath(target)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
}

/** Delivers `event` to one of our endpoints in process (no network) and returns the status. */
export async function deliverEvent(target: WebhookTarget, event: Stripe.Event) {
  const request = signedWebhookRequest(target, event, env.BETTER_AUTH_URL);
  let response: Response;
  if (target === "plugin") {
    const { auth } = await import("@/lib/auth/server");
    response = await auth.handler(request);
  } else {
    const { POST } = await import("@/app/api/billing/stripe-webhook/route");
    response = await POST(request);
  }
  fakeStore().delivered.push({ id: event.id, type: event.type, target, status: response.status });
  if (response.status >= 300) {
    throw new FakeStripeError(
      `The ${target} webhook answered ${response.status} to ${event.type}.`,
      "webhook_failed",
      500,
    );
  }
  return response.status;
}

const period = (sub: FakeSubscription) => sub.items.data[0]!.current_period_end;

function invoiceFor(sub: FakeSubscription, extra: Json = {}) {
  return {
    id: nextId("in"),
    object: "invoice",
    customer: sub.customer,
    status: "paid",
    amount_due: 0,
    number: `FAKE-${(fakeStore().seq + 1000).toString()}`,
    parent: { type: "subscription_details", subscription_details: { subscription: sub.id } },
    ...extra,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* What the fake hosted pages do                                                               */
/* ------------------------------------------------------------------------------------------ */

/** The customer pays a Checkout session: creates the subscription, sends events, returns the redirect. */
export async function completeCheckout(sessionId: string): Promise<{ redirectUrl: string }> {
  const store = fakeStore();
  const session = await checkoutSessions.retrieve(sessionId);
  if (session.status !== "open") throw new FakeStripeError("This Checkout session is not open.");
  session.status = "complete";
  session.payment_status = "paid";

  if (session.mode === "subscription") {
    const start = new Date();
    const sub: FakeSubscription = {
      id: nextId("sub"),
      object: "subscription",
      customer: session.customer ?? "",
      status: "active",
      items: {
        object: "list",
        data: session.line_items.map((li) => makeItem(li.price, li.quantity, start)),
      },
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_start: null,
      trial_end: null,
      metadata: { ...session.subscription_data_metadata },
      schedule: null,
      cancellation_details: null,
      created: seconds(start),
      billing_mode: { type: "flexible" },
    };
    store.subscriptions.set(sub.id, sub);
    session.subscription = sub.id;
    await deliverEvent("plugin", buildEvent("customer.subscription.created", sub));
    await deliverEvent("plugin", buildEvent("checkout.session.completed", session));
    await deliverEvent("billing", buildEvent("invoice.paid", invoiceFor(sub)));
  } else {
    session.payment_intent = nextId("pi");
    await deliverEvent("billing", buildEvent("checkout.session.completed", session));
  }
  return { redirectUrl: session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id) };
}

export function cancelCheckout(sessionId: string) {
  const session = fakeStore().sessions.get(sessionId);
  if (session?.status === "open") session.status = "expired";
  return { redirectUrl: session?.cancel_url ?? env.APP_URL };
}

export type PortalAction = "cancel" | "resume" | "fail_payment" | "pay" | "confirm_update";

/** What a customer can do in the fake Customer Portal (and what the dev script simulates). */
export async function applyPortalAction(portalId: string, action: PortalAction) {
  const portal = fakeStore().portals.get(portalId);
  if (!portal) throw missing("billing_portal.session", portalId);
  const sub = [...fakeStore().subscriptions.values()].find(
    (s) => s.customer === portal.customer && s.status !== "canceled",
  );
  if (!sub) throw new FakeStripeError("This customer has no subscription in the fake Stripe.");
  await simulateSubscription(sub.id, action, portal.flow);
  return { redirectUrl: portal.return_url ?? env.APP_URL };
}

export async function simulateSubscription(
  subscriptionId: string,
  action: PortalAction,
  flow: Json | null = null,
) {
  const sub = await subscriptions.retrieve(subscriptionId);
  switch (action) {
    case "cancel":
      await subscriptions.update(sub.id, { cancel_at_period_end: true });
      break;
    case "resume":
      await subscriptions.update(sub.id, { cancel_at_period_end: false });
      break;
    case "fail_payment":
      sub.status = "past_due";
      break;
    case "pay":
      sub.status = "active";
      break;
    case "confirm_update": {
      const confirm = (flow?.subscription_update_confirm ?? null) as {
        items?: { id: string; price?: string; quantity?: number }[];
      } | null;
      if (confirm?.items?.length) await subscriptions.update(sub.id, { items: confirm.items });
      break;
    }
  }
  await deliverEvent("plugin", buildEvent("customer.subscription.updated", sub));
  if (action === "fail_payment") {
    await deliverEvent(
      "billing",
      buildEvent("invoice.payment_failed", invoiceFor(sub, { status: "open", amount_due: 1200 })),
    );
  } else if (action === "pay") {
    await deliverEvent("billing", buildEvent("invoice.paid", invoiceFor(sub)));
  }
  return sub;
}

/** Sub period end in seconds (used by pages). */
export const fakePeriodEnd = period;
