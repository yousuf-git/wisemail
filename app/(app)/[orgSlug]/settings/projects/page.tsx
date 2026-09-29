import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ProjectsView } from "@/components/projects/projects-view";
import { requireOrg } from "@/lib/dal";
import { getProjectQuota, listProjects } from "@/lib/services/projects";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ params }: PageProps<"/[orgSlug]/settings/projects">) {
  const { orgSlug } = await params;
  const ctx = await requireOrg(orgSlug);
  const header = (
    <PageHeader
      title="Projects"
      description="A project groups domains, like one product or one client. Filters and member access can follow it."
    />
  );
  if (!ctx.can("project:read")) {
    return (
      <>
        {header}
        <EmptyState title="Projects are managed by Owners and Admins" mood="idle">
          Ask an Owner or Admin if you need something grouped.
        </EmptyState>
      </>
    );
  }
  const [projects, quota] = await Promise.all([listProjects(ctx), getProjectQuota(ctx)]);
  return (
    <>
      {header}
      <ProjectsView
        orgSlug={orgSlug}
        projects={projects}
        quota={quota}
        can={{
          create: ctx.can("project:create"),
          update: ctx.can("project:update"),
          delete: ctx.can("project:delete"),
        }}
      />
    </>
  );
}
