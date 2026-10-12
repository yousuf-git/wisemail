import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { stripeIsFake } from "@/lib/billing/stripe";
import { fakeStore } from "@/lib/billing/stripe-fake";
import { fakePriceCatalog } from "@/lib/billing/stripe-prices";
import { env } from "@/lib/env";
import { cancelCheckoutAction, payCheckoutAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fake Stripe Checkout" };

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Stand-in for Stripe's hosted Checkout in `STRIPE_MODE=fake` (dev only). */
export default async function FakeCheckoutPage({ params }: PageProps<"/dev/stripe/checkout/[id]">) {
  if (env.NODE_ENV === "production" || !env.BILLING_ENABLED || !stripeIsFake()) notFound();
  const { id } = await params;
  const session = fakeStore().sessions.get(id);
  if (!session) notFound();
  const catalog = fakePriceCatalog();
  return (
    <main className="mx-auto grid w-full max-w-lg gap-4 px-4 py-10">
      <p
        data-testid="fake-stripe-banner"
        className="rounded-xl bg-warning-soft px-4 py-2 text-sm font-semibold text-warning-ink"
      >
        Fake Stripe Checkout (STRIPE_MODE=fake). No card is charged.
      </p>
      <section className="grid gap-3 rounded-xl bg-surface p-5 shadow-md">
        <h1 className="text-xl font-bold">
          {session.mode === "subscription" ? "Subscribe" : "Buy credits"}
        </h1>
        <ul className="grid gap-2 text-sm" data-testid="fake-checkout-lines">
          {session.line_items.map((li) => {
            const row = catalog.find((p) => p.id === li.price);
            return (
              <li key={li.price} className="flex justify-between gap-4">
                <span>
                  {row?.label ?? li.price}
                  {li.quantity > 1 ? ` x ${li.quantity}` : ""}
                </span>
                <span className="text-ink-muted tabular-nums">
                  {row?.metered
                    ? `${usd(row.unitAmount)} per unit, billed on usage`
                    : usd((row?.unitAmount ?? 0) * li.quantity)}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="flex justify-between border-t border-line pt-3 font-semibold">
          <span>Due today</span>
          <span className="tabular-nums" data-testid="fake-checkout-total">
            {usd(session.amount_total)}
          </span>
        </p>
        {session.status === "open" ? (
          <div className="flex flex-wrap gap-2">
            <form action={payCheckoutAction}>
              <input type="hidden" name="id" value={session.id} />
              <Button type="submit" className="font-bold" data-testid="fake-checkout-pay">
                Pay (fake card 4242)
              </Button>
            </form>
            <form action={cancelCheckoutAction}>
              <input type="hidden" name="id" value={session.id} />
              <Button type="submit" variant="outline">
                Back to Wisemail
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">This session is {session.status}.</p>
        )}
      </section>
    </main>
  );
}
