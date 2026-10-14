import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { AiSettings } from "@/components/ai/ai-settings";
import {
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { ApiError, getAiStatus, getAiUsage } from "@/lib/api";

export function SettingsAiPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/ai" });
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ["ai-status", orgSlug],
    queryFn: () => getAiStatus(orgSlug),
  });

  const usage = useQuery({
    queryKey: ["ai-usage", orgSlug],
    queryFn: () => getAiUsage(orgSlug),
    enabled: !!status.data?.planIncluded && !!status.data?.canConfigure,
    retry: (count, err) => !(err instanceof ApiError && err.status === 403) && count < 2,
  });

  return (
    <ResourcePage
      title="AI"
      description="Feature switches, credits, usage and privacy for this workspace."
    >
      {status.isPending ? (
        <ResourcePending />
      ) : status.isError ? (
        <ResourceError message="Could not load AI status." />
      ) : (
        <AiSettings
          orgSlug={orgSlug}
          status={status.data}
          usage={usage.data ?? null}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["ai-status", orgSlug] });
            void queryClient.invalidateQueries({ queryKey: ["ai-usage", orgSlug] });
          }}
        />
      )}
    </ResourcePage>
  );
}
