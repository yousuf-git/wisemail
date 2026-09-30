import type { Metadata } from "next";

import { Empty, Pager, Panel, Row, RowList, SearchForm, formatDate } from "@/components/admin/admin-ui";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { listUsers } from "@/lib/services/admin/users";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const cursor = typeof sp.cursor === "string" ? sp.cursor : null;
  const page = await listUsers({ q, cursor });
  const href = (c: string) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), cursor: c })}`;
  return (
    <>
      <PageHeader title="Users" description="Search by name or email. Newest first." />
      <SearchForm action="/admin/users" q={q} placeholder="Search name or email" />
      <Panel>
        {page.items.length === 0 ? (
          <Empty>No users match.</Empty>
        ) : (
          <RowList>
            {page.items.map((u) => (
              <Row
                key={u.id}
                href={`/admin/users/${u.id}`}
                aside={
                  <>
                    {u.isAdmin ? <StatusChip state="engaged">Admin</StatusChip> : null}
                    {u.banned ? <StatusChip state="danger">Banned</StatusChip> : null}
                    {u.emailVerified ? null : <StatusChip state="warning">Unverified</StatusChip>}
                    <span className="text-xs text-ink-muted">
                      {u.orgCount} {u.orgCount === 1 ? "workspace" : "workspaces"} · {formatDate(u.createdAt)}
                    </span>
                  </>
                }
              >
                <p className="truncate text-sm font-semibold">{u.name || u.email}</p>
                <p className="truncate text-xs text-ink-muted">{u.email}</p>
              </Row>
            ))}
          </RowList>
        )}
      </Panel>
      <Pager href={href} nextCursor={page.nextCursor} />
    </>
  );
}
