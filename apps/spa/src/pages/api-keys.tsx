import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { ApiKeysView } from "@/components/api-keys/api-keys-view";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listApiKeys } from "@/lib/api";

export function ApiKeysPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/api-keys" });
  const queryClient = useQueryClient();
  const keys = useQuery({
    queryKey: ["api-keys", orgSlug],
    queryFn: () => listApiKeys(orgSlug),
  });

  return (
    <ResourcePage
      title="API keys"
      description="The keys in your Resend accounts. Wisemail only keeps their names; a new key's secret is shown once."
    >
      {keys.isPending ? (
        <ResourcePending />
      ) : keys.isError ? (
        <ResourceError message="Could not load API keys." />
      ) : !keys.data.can.read ? (
        <ResourceEmpty>
          Your role can&apos;t see API keys. Ask an Owner or Admin if you need one.
        </ResourceEmpty>
      ) : (
        <ApiKeysView
          orgSlug={orgSlug}
          data={keys.data}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["api-keys", orgSlug] });
          }}
        />
      )}
    </ResourcePage>
  );
}
