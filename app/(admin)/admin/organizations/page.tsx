import type { Metadata } from "next";

import {
  Empty,
  Pager,
  Panel,
  PlanChip,
  Row,
  RowList,
  SearchForm,
  formatDate,
  formatNumber,
} from "@/components/admin/admin-ui";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { listOrgs } from "@/lib/services/admin/orgs";

export const metadata: Metadata = { title: "Organizations" };

export default async function AdminOrganizationsPage({
  searchParams,
}: PageProps<"/admin/organizations">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const cursor = typeof sp.cursor === "string" ? sp.cursor : null;
  const page = await listOrgs({ q, cursor });
  const href = (c: string) =>
    `/admin/organizations?${new URLSearchParams({ ...(q ? { q } : {}), cursor: c })}`;
  return (
    <>
      <PageHeader title="Organizations" description="Search by name or slug. Newest first." />
      <SearchForm action="/admin/organizations" q={q} placeholder="Search name or slug" />
      <Panel>
        {page.items.length === 0 ? (
          <Empty>No organizations match.</Empty>
        ) : (
          <RowList>
            {page.items.map((o) => (
              <Row
                key={o.id}
                href={`/admin/organizations/${o.id}`}
                aside={
                  <>
                    {o.suspended ? <StatusChip state="danger">Suspended</StatusChip> : null}
                    <PlanChip plan={o.plan} label={o.planState === "trialing" ? `${o.planLabel} trial` : o.planLabel} />
                  </>
                }
              >
                <p className="truncate text-sm font-semibold">{o.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  /{o.slug} · {o.members} {o.members === 1 ? "member" : "members"} · {o.connections}{" "}
                  {o.connections === 1 ? "connection" : "connections"} · {formatNumber(o.trackedThisPeriod)}{" "}
                  tracked · {formatDate(o.createdAt)}
                </p>
              </Row>
            ))}
          </RowList>
        )}
      </Panel>
      <Pager href={href} nextCursor={page.nextCursor} />
    </>
  );
}
