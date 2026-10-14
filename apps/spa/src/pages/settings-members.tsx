import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { MembersView } from "@/components/members/members-view";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listMembersBundle } from "@/lib/api";

export function SettingsMembersPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/members" });
  const queryClient = useQueryClient();
  const bundle = useQuery({
    queryKey: ["members", orgSlug],
    queryFn: () => listMembersBundle(orgSlug),
  });

  return (
    <ResourcePage
      title="Members"
      description="Invite people, set their role and, on Team and above, limit them to specific projects."
    >
      {bundle.isPending ? (
        <ResourcePending />
      ) : bundle.isError ? (
        <ResourceError message="Could not load members." />
      ) : !bundle.data.can.read ? (
        <ResourceEmpty>
          Ask an Owner or Admin if you need access changed.
        </ResourceEmpty>
      ) : (
        <MembersView
          orgSlug={orgSlug}
          data={bundle.data}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["members", orgSlug] });
          }}
        />
      )}
    </ResourcePage>
  );
}
