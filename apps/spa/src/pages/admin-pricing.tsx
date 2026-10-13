import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { callAdminAction, getAdminCatalog } from "@/lib/admin-api";

export function AdminPricingPage() {
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: getAdminCatalog });
  const [plan, setPlan] = useState<"pro" | "team" | "agency">("pro");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [priceUsd, setPriceUsd] = useState("12");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      callAdminAction("admin.catalog.updatePlanPrice", {
        plan,
        interval,
        priceUsd: Number(priceUsd),
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
    },
  });

  if (catalog.isPending) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (catalog.isError || !catalog.data) {
    return <p className="text-sm text-danger-ink">Could not load catalog.</p>;
  }

  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-sm text-ink-muted">
          Update paid plan amounts in the catalog (Stripe migration when billing is on).
        </p>
      </header>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="grid max-w-md gap-3 rounded-xl border border-line bg-surface p-4">
        <label className="grid gap-1 text-sm">
          Plan
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as typeof plan)}
            className="h-9 rounded-control border border-line bg-canvas-sunken px-2"
          >
            <option value="pro">Pro</option>
            <option value="team">Team</option>
            <option value="agency">Agency</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Interval
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value as typeof interval)}
            className="h-9 rounded-control border border-line bg-canvas-sunken px-2"
          >
            <option value="month">Monthly</option>
            <option value="year">Annual</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Price (USD)
          <input
            type="number"
            min={1}
            step={0.01}
            value={priceUsd}
            onChange={(e) => setPriceUsd(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas-sunken px-3"
          />
        </label>
        <button
          type="button"
          disabled={save.isPending || !Number(priceUsd)}
          onClick={() => save.mutate()}
          className="h-9 w-fit rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Update price"}
        </button>
      </div>
      <pre className="overflow-auto rounded-xl border border-line bg-surface p-4 text-xs">
        {JSON.stringify(catalog.data.recentChanges ?? [], null, 2)}
      </pre>
    </>
  );
}
