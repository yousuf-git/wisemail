import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { callAdminAction, getAdminCatalog } from "@/lib/admin-api";

type CatalogShape = {
  catalog?: {
    trialDays?: number;
    trialAiCredits?: number;
    billingEnabled?: boolean;
    systemFromEmail?: string | null;
  };
};

export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: getAdminCatalog });
  const [trialDays, setTrialDays] = useState(14);
  const [trialAiCredits, setTrialAiCredits] = useState(200);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = (catalog.data as CatalogShape | undefined)?.catalog;
    if (!c) return;
    if (typeof c.trialDays === "number") setTrialDays(c.trialDays);
    if (typeof c.trialAiCredits === "number") setTrialAiCredits(c.trialAiCredits);
  }, [catalog.data]);

  const save = useMutation({
    mutationFn: () =>
      callAdminAction("admin.catalog.updatePlatformSettings", {
        trialDays,
        trialAiCredits,
        reason: "SPA admin settings update",
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
  if (catalog.isError) {
    return <p className="text-sm text-danger-ink">Could not load platform settings.</p>;
  }

  return (
    <>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Platform</h1>
        <p className="text-sm text-ink-muted">
          Trial length and AI credit allotment. Secrets stay in environment variables.
        </p>
      </header>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="grid max-w-md gap-3 rounded-xl border border-line bg-surface p-4">
        <label className="grid gap-1 text-sm">
          Trial days
          <input
            type="number"
            min={1}
            max={90}
            value={trialDays}
            onChange={(e) => setTrialDays(Number(e.target.value))}
            className="h-9 rounded-control border border-line bg-canvas-sunken px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Trial AI credits
          <input
            type="number"
            min={0}
            value={trialAiCredits}
            onChange={(e) => setTrialAiCredits(Number(e.target.value))}
            className="h-9 rounded-control border border-line bg-canvas-sunken px-3"
          />
        </label>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="h-9 w-fit rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}
