import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { ProjectsView } from "@/components/projects/projects-view";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listProjects } from "@/lib/api";

export function SettingsProjectsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/settings/projects" });
  const queryClient = useQueryClient();
  const projects = useQuery({
    queryKey: ["projects", orgSlug],
    queryFn: () => listProjects(orgSlug),
  });

  return (
    <ResourcePage
      title="Projects"
      description="A project groups domains, like one product or one client. Filters and member access can follow it."
    >
      {projects.isPending ? (
        <ResourcePending />
      ) : projects.isError ? (
        <ResourceError message="Could not load projects." />
      ) : !projects.data.can.read ? (
        <ResourceEmpty>
          Ask an Owner or Admin if you need something grouped.
        </ResourceEmpty>
      ) : (
        <ProjectsView
          orgSlug={orgSlug}
          data={projects.data}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ["projects", orgSlug] });
          }}
        />
      )}
    </ResourcePage>
  );
}
