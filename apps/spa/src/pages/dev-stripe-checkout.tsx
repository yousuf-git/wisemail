import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { apiUrl } from "@/lib/api-base";

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

type CheckoutPayload = {
  session: {
    id: string;
    mode: string;
    status: string;
    amount_total: number;
    line_items: {
      price: string;
      quantity: number;
      label: string;
      unitAmount: number;
      metered: boolean;
    }[];
  };
};

export function DevStripeCheckoutPage() {
  const { id } = useParams({ from: "/dev/stripe/checkout/$id" });
  const queryClient = useQueryClient();

  const session = useQuery({
    queryKey: ["dev-checkout", id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/dev/stripe/checkout/${encodeURIComponent(id)}`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error(res.status === 404 ? "Checkout not found." : `HTTP ${res.status}`);
      return (await res.json()) as CheckoutPayload;
    },
  });

  const pay = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl(`/api/dev/stripe/checkout/${encodeURIComponent(id)}/pay`), {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as { redirectUrl?: string; message?: string };
      if (!res.ok) throw new Error(body.message ?? "Pay failed.");
      return body;
    },
    onSuccess: (body) => {
      if (body.redirectUrl) window.location.assign(body.redirectUrl);
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl(`/api/dev/stripe/checkout/${encodeURIComponent(id)}/cancel`), {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as { redirectUrl?: string; message?: string };
      if (!res.ok) throw new Error(body.message ?? "Cancel failed.");
      return body;
    },
    onSuccess: (body) => {
      if (body.redirectUrl) window.location.assign(body.redirectUrl);
    },
  });

  if (session.isPending) {
    return <p className="p-6 text-sm text-ink-muted">Loading checkout…</p>;
  }
  if (session.isError) {
    return (
      <p role="alert" className="m-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">
        {session.error.message}
      </p>
    );
  }

  const s = session.data.session;
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
          {s.mode === "subscription" ? "Subscribe" : "Buy credits"}
        </h1>
        <ul className="grid gap-2 text-sm" data-testid="fake-checkout-lines">
          {s.line_items.map((li) => (
            <li key={li.price} className="flex justify-between gap-4">
              <span>
                {li.label}
                {li.quantity > 1 ? ` x ${li.quantity}` : ""}
              </span>
              <span className="text-ink-muted tabular-nums">
                {li.metered
                  ? `${usd(li.unitAmount)} per unit, billed on usage`
                  : usd(li.unitAmount * li.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t border-line pt-3 font-semibold">
          <span>Due today</span>
          <span className="tabular-nums" data-testid="fake-checkout-total">
            {usd(s.amount_total)}
          </span>
        </p>
        {s.status === "open" ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="fake-checkout-pay"
              disabled={pay.isPending}
              onClick={() => pay.mutate()}
              className="h-9 rounded-control bg-accent-fill px-4 text-sm font-bold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
            >
              {pay.isPending ? "Paying…" : "Pay (fake card 4242)"}
            </button>
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
              className="h-9 rounded-control border border-line px-4 text-sm font-semibold hover:bg-canvas disabled:opacity-50"
            >
              Back to Wisemail
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            This session is {s.status}.{" "}
            <button
              type="button"
              className="font-semibold text-accent-fill hover:underline"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["dev-checkout", id] })}
            >
              Refresh
            </button>
          </p>
        )}
        {pay.isError || cancel.isError ? (
          <p role="alert" className="text-sm text-danger-ink">
            {(pay.error ?? cancel.error)?.message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
