import type { ActionResult } from "@wisemail/shared/action-result";

/**
 * SPA fetch helpers. Same-origin `/api` (Vite proxy → Fastify in dev).
 * Keep paths literal for static analysis (`bundle-analyzable-paths`).
 */
function apiBase(): string {
  const vite = import.meta.env.VITE_API_URL;
  return typeof vite === "string" ? vite.replace(/\/$/, "") : "";
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new Error(`${path} invalid JSON`);
  }
  return parsed as T;
}

export async function callOrgAction<T>(
  id: string,
  orgSlug: string,
  input: unknown,
): Promise<ActionResult<T>> {
  return postJson<ActionResult<T>>(`/api/v1/actions/${encodeURIComponent(id)}`, {
    orgSlug,
    input,
  });
}

export async function getCatalog() {
  return getJson<unknown>("/api/v1/catalog");
}

/** Mirrors `MailListRowDTO` from the web DTO (keep fields in sync as pages port). */
export type MailListRow = {
  kind: "thread" | "email";
  id: string;
  subject: string;
  snippet: string;
  people: string[];
  peopleLabels?: string[];
  lastMessageAt: string;
  unread: boolean;
};

export type ThreadListPage = {
  items: MailListRow[];
  nextCursor: string | null;
};

export async function listThreads(
  orgSlug: string,
  folder: "inbox" | "sent" | "scheduled" | "trash",
  limit = 30,
) {
  const q = new URLSearchParams({
    orgSlug,
    folder,
    limit: String(limit),
  });
  return getJson<ThreadListPage>(`/api/v1/threads?${q}`);
}

export const listInboxThreads = (orgSlug: string, limit = 30) =>
  listThreads(orgSlug, "inbox", limit);

export type GeneralSettings = { name: string; slug: string; timezone: string };

export async function getGeneralSettings(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<GeneralSettings>(`/api/v1/settings/general?${q}`);
}

export type Sender = {
  id: string;
  address: string;
  displayName: string;
  status: string;
  isDefault: boolean;
  version: number;
};

export async function listSenders(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<Sender[]>(`/api/v1/senders?${q}`);
}

export type ActivityRow = {
  id: string;
  subject: string;
  status: string;
  direction: "inbound" | "outbound";
  at: string;
};

export type ActivityPage = { items: ActivityRow[]; nextCursor: string | null };

export async function listActivity(orgSlug: string, limit = 30) {
  const q = new URLSearchParams({ orgSlug, limit: String(limit) });
  return getJson<ActivityPage>(`/api/v1/activity?${q}`);
}

export type ContactRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  connectionName: string;
  unsubscribed: boolean;
  createdAt: string;
};

export type ContactPage = { items: ContactRow[]; nextCursor: string | null };

export async function listContacts(orgSlug: string, limit = 50) {
  const q = new URLSearchParams({ orgSlug, limit: String(limit) });
  return getJson<ContactPage>(`/api/v1/contacts?${q}`);
}

export type ConnectionRow = {
  id: string;
  name: string;
  status: string;
  statusReason: string | null;
  apiKeyLast4: string | null;
  lastSyncAt: string | null;
};

export async function listConnections(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<ConnectionRow[]>(`/api/v1/connections?${q}`);
}

export type DomainRow = {
  id: string;
  name: string;
  status: string;
  connectionName: string;
  openTracking: boolean;
  clickTracking: boolean;
  receivingEnabled: boolean;
};

export async function listDomains(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<DomainRow[]>(`/api/v1/domains?${q}`);
}

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
  isYou: boolean;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: string;
  status?: string;
  expiresAt?: string | null;
};

export async function listMembersBundle(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<{ members: MemberRow[]; invitations: InvitationRow[] }>(
    `/api/v1/members?${q}`,
  );
}

export type ApiKeyRow = {
  id: string;
  name: string;
  connectionName: string;
  permission: string | null;
  domainName: string | null;
  createdAt: string | null;
};

export async function listApiKeys(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<ApiKeyRow[]>(`/api/v1/api-keys?${q}`);
}

export type IncidentRow = {
  id: string;
  title: string;
  summary: string;
  status: string;
  ruleName: string;
  openedAt: string;
};

export async function listIncidents(orgSlug: string, status: "active" | "all" = "active") {
  const q = new URLSearchParams({ orgSlug, status });
  return getJson<IncidentRow[]>(`/api/v1/incidents?${q}`);
}

export type InsightsSummary = {
  days: number;
  hasData: boolean;
  totals: { sent: number; delivered: number; opened: number; clicked: number; bounced: number };
  rates: {
    delivered: number | null;
    opened: number | null;
    clicked: number | null;
    bounced: number | null;
  };
  generatedAt: string;
};

export async function getInsights(orgSlug: string, days: 7 | 30 | 90 = 7) {
  const q = new URLSearchParams({ orgSlug, days: String(days) });
  return getJson<InsightsSummary>(`/api/v1/insights?${q}`);
}

export type BroadcastRow = {
  id: string;
  name: string;
  subject: string;
  status: string;
  connectionName: string;
  segmentName: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  updatedAt: string;
};

export async function listBroadcasts(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<BroadcastRow[]>(`/api/v1/broadcasts?${q}`);
}

export type TemplateRow = {
  id: string;
  name: string;
  alias: string;
  status: string;
  subject: string;
  connectionName: string;
  variableCount: number;
  updatedAt: string;
};

export async function listTemplates(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<TemplateRow[]>(`/api/v1/templates?${q}`);
}
