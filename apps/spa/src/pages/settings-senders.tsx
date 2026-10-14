import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { SendersView } from "@/components/senders/senders-view";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listSenders } from "@/lib/api";

export function SettingsSendersPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/senders" });
  const queryClient = useQueryClient();
  const senders = useQuery({
    queryKey: ["senders", orgSlug],
    queryFn: () => listSenders(orgSlug),
  });

  return (
    <ResourcePage
      title="Senders"
      description="A sender is an address on a verified domain, like support@yourdomain.com. Pick one whenever you write."
    >
      {senders.isPending ? (
        <ResourcePending />
      ) : senders.isError ? (
        <ResourceError message="Could not load senders." />
      ) : !senders.data.can.read ? (
        <ResourceEmpty>
          Your role can&apos;t see senders. Ask an Owner or Admin if you need one.
        </ResourceEmpty>
      ) : (
        <SendersView
          orgSlug={orgSlug}
          data={senders.data}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["senders", orgSlug] });
          }}
        />
      )}
    </ResourcePage>
  );
}
