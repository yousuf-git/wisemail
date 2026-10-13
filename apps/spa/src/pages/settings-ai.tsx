import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { callOrgAction, getAiStatus } from "@/lib/api";

const FLAGS = [
  { key: "triage", label: "Inbox triage" },
  { key: "drafts", label: "Reply drafts" },
  { key: "compose", label: "Compose helpers" },
  { key: "anomalies", label: "Anomaly explanations" },
] as const;

export function SettingsAiPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/ai" });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ["ai-status", orgSlug],
    queryFn: () => getAiStatus(orgSlug),
  });

  const [enabled, setEnabled] = useState(true);
  const [features, setFeatures] = useState({
    triage: true,
    drafts: true,
    compose: true,
    anomalies: true,
  });

  useEffect(() => {
    if (!status.data) return;
    setEnabled(status.data.enabled);
    setFeatures({ ...status.data.features });
  }, [status.data]);

  const save = useMutation({
    mutationFn: () =>
      callOrgAction("settings.ai.update", orgSlug, { enabled, features }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["ai-status", orgSlug] });
    },
    onError: () => setError("Could not save AI settings."),
  });

  return (
    <ResourcePage title="AI" description="Plan gate · feature flags · credits">
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {status.isPending ? (
        <ResourcePending />
      ) : status.isError ? (
        <ResourceError message="Could not load AI status." />
      ) : (
        <div className="grid max-w-lg gap-4">
          <p className="text-sm text-ink-muted">
            {status.data.planLabel}
            {status.data.planIncluded ? "" : " · AI not in plan"}
            {" · "}
            {status.data.credits.available} credits available
          </p>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!status.data.canConfigure || !status.data.planIncluded}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            AI enabled for this workspace
          </label>
          <ul className="grid gap-2 rounded-lg border border-line bg-surface p-3">
            {FLAGS.map((f) => (
              <li key={f.key}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={features[f.key]}
                    disabled={!status.data.canConfigure || !enabled}
                    onChange={(e) =>
                      setFeatures((prev) => ({ ...prev, [f.key]: e.target.checked }))
                    }
                  />
                  {f.label}
                </label>
              </li>
            ))}
          </ul>
          {status.data.canConfigure ? (
            <button
              type="button"
              disabled={save.isPending || !status.data.planIncluded}
              onClick={() => save.mutate()}
              className="h-9 w-fit rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          ) : (
            <p className="text-xs text-ink-muted">Only Owners and Admins can change AI settings.</p>
          )}
        </div>
      )}
    </ResourcePage>
  );
}
