import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { stripeIsFake } from "@/lib/billing/stripe";
import { fakeStore } from "@/lib/billing/stripe-fake";
import { fakePriceCatalog } from "@/lib/billing/stripe-prices";
import { env } from "@/lib/env";
import { portalAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fake Stripe Portal" };

/** Stand-in for Stripe's Customer Portal in `STRIPE_MODE=fake` (dev only). */
export default async function FakePortalPage({ params }: PageProps<"/dev/stripe/portal/[id]">) {
  if (env.NODE_ENV === "production" || !env.BILLING_ENABLED || !stripeIsFake()) notFound();
  const { id } = await params;
  const store = fakeStore();
  const portal = store.portals.get(id);
  if (!portal) notFound();
  const sub = [...store.subscriptions.values()].find(
    (s) => s.customer === portal.customer && s.status !== "canceled",
  );
  const catalog = fakePriceCatalog();
  const flow = (portal.flow?.type as string | undefined) ?? null;
  const button = (action: string, label: string, testId: string, primary = false) => (
    <form action={portalAction}>
      <input type="hidden" name="id" value={portal.id} />
      <input type="hidden" name="action" value={action} />
      <Button
        type="submit"
        variant={primary ? "default" : "outline"}
        className={primary ? "font-bold" : undefined}
        data-testid={testId}
      >
        {label}
      </Button>
    </form>
  );
  return (
    <main className="mx-auto grid w-full max-w-lg gap-4 px-4 py-10">
      <p
        data-testid="fake-stripe-banner"
        className="rounded-xl bg-warning-soft px-4 py-2 text-sm font-semibold text-warning-ink"
      >
        Fake Stripe Customer Portal (STRIPE_MODE=fake).
      </p>
      <section className="grid gap-3 rounded-xl bg-surface p-5 shadow-md">
        <h1 className="text-xl font-bold">Billing portal</h1>
        {sub ? (
          <>
            <p className="text-sm text-ink-secondary" data-testid="fake-portal-status">
              Subscription <span className="font-mono">{sub.id}</span> is{" "}
              <b>{sub.cancel_at_period_end ? "set to cancel at period end" : sub.status}</b>.
            </p>
            <ul className="grid gap-1 text-sm">
              {sub.items.data.map((item) => (
                <li key={item.id}>
                  {catalog.find((p) => p.id === item.price.id)?.label ?? item.price.id}
                  {item.quantity > 1 ? ` x ${item.quantity}` : ""}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {flow === "subscription_update_confirm"
                ? button("confirm_update", "Confirm plan change", "fake-portal-confirm", true)
                : null}
              {sub.cancel_at_period_end
                ? button("resume", "Resume subscription", "fake-portal-resume")
                : button("cancel", "Cancel at period end", "fake-portal-cancel")}
              {sub.status === "past_due"
                ? button("pay", "Update payment method and pay", "fake-portal-pay", true)
                : button("fail_payment", "Simulate a failed payment", "fake-portal-fail")}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            This customer has no subscription in the fake Stripe (the fake store is forgotten when
            the server restarts).
          </p>
        )}
        <a
          href={portal.return_url ?? "/"}
          className="text-sm font-semibold text-accent-fill hover:underline"
          data-testid="fake-portal-return"
        >
          Return to Wisemail
        </a>
      </section>
    </main>
  );
}
