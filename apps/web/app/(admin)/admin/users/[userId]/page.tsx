import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { Empty, KeyValue, Panel, Row, RowList, formatDate, formatDateTime } from "@/components/admin/admin-ui";
import { UserActions } from "@/components/admin/user-actions";
import { PageHeader } from "@/components/app/page-header";
import { StatusChip } from "@/components/app/status-chip";
import { requirePlatformAdmin } from "@/lib/admin/guard";
import { getUserDetail } from "@/lib/services/admin/users";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[userId]">) {
  const admin = await requirePlatformAdmin();
  const { userId } = await params;
  const user = await getUserDetail(userId);
  if (!user) notFound();
  return (
    <>
      <PageHeader
        title={user.name || user.email}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {user.email}
            {user.isAdmin ? <StatusChip state="engaged">Platform admin</StatusChip> : null}
            {user.banned ? <StatusChip state="danger">Banned</StatusChip> : null}
            {user.emailVerified ? <StatusChip state="success">Verified</StatusChip> : <StatusChip state="warning">Unverified</StatusChip>}
          </span>
        }
        actions={
          <Link href="/admin/users" className="text-sm font-medium text-accent-fill hover:underline">
            All users
          </Link>
        }
      />
      <div className="grid gap-3.5 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid min-w-0 content-start gap-3.5">
          <Panel title="Account">
            <KeyValue
              items={[
                { label: "User id", value: <code className="font-mono text-xs">{user.id}</code> },
                { label: "Created", value: formatDate(user.createdAt) },
                { label: "Sign-in methods", value: user.providers.length ? user.providers.join(", ") : "none" },
                { label: "Active sessions", value: user.sessions.active },
                { label: "Last session started", value: formatDateTime(user.sessions.lastCreatedAt) },
                { label: "Last seen", value: formatDateTime(user.sessions.lastSeenAt) },
                ...(user.banned
                  ? [
                      { label: "Ban reason", value: user.banReason ?? "none given" },
                      { label: "Ban ends", value: user.banExpires ? formatDate(user.banExpires) : "never" },
                    ]
                  : []),
              ]}
            />
          </Panel>
          <Panel title="Workspaces" description="Memberships and roles.">
            {user.memberships.length === 0 ? (
              <Empty>Not a member of any workspace.</Empty>
            ) : (
              <RowList>
                {user.memberships.map((m) => (
                  <Row
                    key={m.orgId}
                    href={`/admin/organizations/${m.orgId}`}
                    aside={<StatusChip state="info">{m.role}</StatusChip>}
                  >
                    <p className="truncate text-sm font-semibold">{m.orgName}</p>
                    <p className="truncate text-xs text-ink-muted">/{m.orgSlug} · joined {formatDate(m.joinedAt)}</p>
                  </Row>
                ))}
              </RowList>
            )}
          </Panel>
        </div>
        <Panel title="Actions" description="Written to the audit log with your name.">
          <UserActions
            userId={user.id}
            banned={user.banned}
            isAdmin={user.isAdmin}
            isSelf={user.id === admin.id}
            emailVerified={user.emailVerified}
          />
        </Panel>
      </div>
    </>
  );
}
