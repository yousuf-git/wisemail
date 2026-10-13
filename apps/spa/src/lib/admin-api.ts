import type { ActionResult } from "@wisemail/shared/action-result";

import { apiUrl } from "@/lib/api-base";

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export async function callAdminAction<T>(id: string, input: unknown): Promise<ActionResult<T>> {
  const res = await fetch(apiUrl(`/api/v1/admin-actions/${encodeURIComponent(id)}`), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ input }),
  });
  return (await res.json()) as ActionResult<T>;
}

export type AdminActor = { id: string; name: string; email: string };

export type AdminOverview = {
  counts: {
    users: number;
    organizations: number;
    activeConnections: number;
    needsAttentionConnections: number;
    eventsLast24h: number;
    failedSyncRuns24h: number;
    failedEvents24h: number;
    signupsLast7d: number;
  };
  plans: { plan: string; label: string; count: number }[];
  trialing: number;
  suspended: number;
  recentSignups: AdminUserRow[];
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  banned: boolean;
  createdAt: string;
  orgCount: number;
};

export type AdminOrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planLabel: string;
  planState: string;
  suspended: boolean;
  createdAt: string;
  members: number;
  connections: number;
  trackedThisPeriod: number;
};

export type AdminLimitRow = {
  key: string;
  label: string;
  effective: number | null;
  catalog: number | null;
  override: number | null;
};

export type AdminOrgDetail = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planLabel: string;
  planState: string;
  billingEnabled: boolean;
  trial: { startedAt: string; endsAt: string; active: boolean; daysLeft: number } | null;
  suspended: { at: string; by: string | null; reason: string } | null;
  limits: AdminLimitRow[];
};

export const getAdminMe = () => adminGet<AdminActor>("/api/v1/admin/me");
export const getAdminOverview = () => adminGet<AdminOverview>("/api/v1/admin/overview");
export const listAdminUsers = (q?: string) =>
  adminGet<{ items: AdminUserRow[]; nextCursor: string | null }>(
    `/api/v1/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );
export const getAdminUser = (userId: string) =>
  adminGet<AdminUserRow & Record<string, unknown>>(
    `/api/v1/admin/users/${encodeURIComponent(userId)}`,
  );
export const listAdminOrgs = (q?: string) =>
  adminGet<{ items: AdminOrgRow[]; nextCursor: string | null }>(
    `/api/v1/admin/organizations${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );
export const getAdminOrg = (orgId: string) =>
  adminGet<AdminOrgDetail>(`/api/v1/admin/organizations/${encodeURIComponent(orgId)}`);
export const getAdminHealth = () => adminGet<Record<string, unknown>>("/api/v1/admin/health");
export const getAdminCatalog = () => adminGet<Record<string, unknown>>("/api/v1/admin/catalog");
