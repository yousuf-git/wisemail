import type { ActionResult } from "@wisemail/shared/action-result";

import { apiUrl } from "@/lib/api-base";

/**
 * SPA fetch helpers. Dev: same-origin `/api` via Vite proxy.
 * Prod (Vercel): set `VITE_API_URL` to the OCI API origin (e.g. https://api.example.com).
 * Keep paths literal for static analysis (`bundle-analyzable-paths`).
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    let code: string | undefined;
    let message = `${path} ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (typeof body.error === "string") code = body.error;
      if (typeof body.message === "string") message = body.message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status, code);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
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
  if (!res.ok) {
    const msg =
      parsed &&
      typeof parsed === "object" &&
      "message" in parsed &&
      typeof (parsed as { message: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : `${path} ${res.status}`;
    throw new Error(msg);
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

export async function callUserAction<T>(id: string, input: unknown): Promise<ActionResult<T>> {
  return postJson<ActionResult<T>>(`/api/v1/user-actions/${encodeURIComponent(id)}`, { input });
}

export type InvitePreview =
  | { status: "invalid" }
  | { status: "expired"; orgName: string }
  | { status: "used"; orgName: string }
  | {
      status: "pending";
      orgName: string;
      role: string;
      maskedEmail: string;
      emailMatches?: boolean;
      emailVerified?: boolean;
      signedInEmail?: string;
    };

export async function getInvitePreview(token: string) {
  return getJson<InvitePreview>(`/api/v1/invite/preview?token=${encodeURIComponent(token)}`);
}

export async function getCatalog() {
  return getJson<unknown>("/api/v1/catalog");
}

/** Mirrors `MailListRowDTO` from the web DTO (keep fields in sync as pages port). */
export type MailListRow = {
  kind: "thread" | "email";
  id: string;
  threadId: string | null;
  subject: string;
  snippet: string;
  people: string[];
  peopleLabels?: string[];
  lastMessageAt: string;
  unread: boolean;
};

export type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  from: { address: string; name?: string };
  to: { address: string; name?: string }[];
  subject: string;
  snippet: string;
  at: string;
  html: string | null;
  text: string | null;
};

export type ThreadDetail = {
  id: string;
  subject: string;
  mailboxAddress: string;
  participants: string[];
  messageCount: number;
  unread: boolean;
  messages: ThreadMessage[];
};

export async function getThread(orgSlug: string, threadId: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<ThreadDetail>(`/api/v1/threads/${encodeURIComponent(threadId)}?${q}`);
}

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
  domainId: string;
  connectionId: string;
  signatureHtml?: string;
};

export type TemplateOption = {
  id: string;
  connectionId: string;
  name: string;
  subject: string;
  html: string;
  variables: { key: string; type: "string" | "number"; fallback: string | number | null }[];
};

export async function listTemplateOptions(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<TemplateOption[]>(`/api/v1/templates/options?${q}`);
}

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

export type ChecklistItem = {
  key: string;
  status: "ok" | "warn" | "fail";
  checkedAt: string;
  title: string;
  technical: string | null;
  detail: string;
  fix: { kind: string; label: string } | null;
  domains?: string[];
};

export type SyncStatus = {
  runId: string;
  state: "running" | "completed" | "failed";
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  stage: { key: string; label: string } | null;
  error: string | null;
  progress: { key: string; label: string; status: string; count: number }[];
};

export type ConnectionRow = {
  id: string;
  name: string;
  status: string;
  statusReason: string | null;
  apiKeyLast4: string | null;
  webhookRegistered: boolean;
  lastEventAt: string | null;
  lastSyncAt: string | null;
  checklist: ChecklistItem[] | null;
  sync: SyncStatus | null;
  createdAt: string;
};

export type ConnectionQuota = {
  used: number;
  limit: number;
  planLabel: string;
  nextTierLabel: string | null;
  extraUnitUsd?: number | null;
};

export type ConnectionPermissions = {
  create: boolean;
  update: boolean;
  delete: boolean;
  domainUpdate: boolean;
};

export type ConnectionsPage = {
  connections: ConnectionRow[];
  quota: ConnectionQuota;
  can: ConnectionPermissions;
};

export async function listConnections(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<ConnectionsPage>(`/api/v1/connections?${q}`);
}

export type ConnectionDetail = ConnectionRow & {
  checklist: ChecklistItem[];
  counts: Record<string, number>;
  domains: {
    id: string;
    name: string;
    status: string;
    openTracking: boolean;
    clickTracking: boolean;
    receiving: boolean;
    records: { record: string; type: string; name: string; value: string; status: string }[];
  }[];
};

export async function getConnection(orgSlug: string, connectionId: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<{
    connection: ConnectionDetail;
    can: { update: boolean; domainUpdate: boolean };
  }>(`/api/v1/connections/${encodeURIComponent(connectionId)}?${q}`);
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

export type AlertRuleRow = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  activeIncidents: number;
  condition: { operator: string; threshold: number; windowMinutes: number };
  createdAt: string;
};

export async function listAlertRules(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<AlertRuleRow[]>(`/api/v1/alert-rules?${q}`);
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

export type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  color: string;
  description: string;
  domainCount: number;
  scopedMemberCount: number;
};

export async function listProjects(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<ProjectRow[]>(`/api/v1/projects?${q}`);
}

export type NotificationPrefs = {
  channels: Record<string, { inApp: boolean; email: boolean }>;
  quietHours: { start: string; end: string; timezone: string } | null;
  digest: "none" | "daily";
  orgTimezone: string;
  digestAllowed: boolean;
  planLabel: string;
};

export async function getNotificationPrefs(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<NotificationPrefs>(`/api/v1/settings/notifications?${q}`);
}

export type BillingPlanCard = {
  id: string;
  label: string;
  tagline: string;
  priceMonthly: number;
  priceAnnualPerMonth: number;
};

export type BillingOverview = {
  billingEnabled: boolean;
  currentPlan: string;
  currentLabel: string;
  planState: string;
  trial: { active: boolean; endsAt: string; daysLeft: number } | null;
  trialAvailable: boolean;
  canManage: boolean;
  plans: BillingPlanCard[];
  priceMigration: { message: string } | null;
  stripe: {
    interval: "month" | "year" | null;
    hasSubscription: boolean;
    renewsAt: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

export async function getBillingOverview(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<BillingOverview>(`/api/v1/settings/billing?${q}`);
}

export type AiStatus = {
  planIncluded: boolean;
  enabled: boolean;
  features: { triage: boolean; drafts: boolean; compose: boolean; anomalies: boolean };
  canUse: boolean;
  canConfigure: boolean;
  credits: {
    allowance: number;
    used: number;
    reserved: number;
    packs: number;
    available: number;
    resetsAt: string;
  };
  planLabel: string;
};

export async function getAiStatus(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<AiStatus>(`/api/v1/ai/status?${q}`);
}

export type AiComposeResult =
  | { kind: "subjects"; suggestions: string[]; model: string }
  | { kind: "text"; html: string; text: string; model: string };

export async function aiComposeAssist(
  orgSlug: string,
  input: {
    action: "subjects" | "rewrite" | "shorten" | "grammar";
    subject?: string;
    bodyHtml: string;
    tone?: "friendly" | "professional" | "concise" | "empathetic";
  },
) {
  const q = new URLSearchParams({ orgSlug });
  return postJson<AiComposeResult>(`/api/v1/ai/compose?${q}`, input);
}

export type AiDraftResult = { html: string; text: string; model: string };

export async function aiDraftReply(
  orgSlug: string,
  input: {
    threadId: string;
    tone?: "friendly" | "professional" | "concise" | "empathetic";
    instructions?: string;
  },
) {
  const q = new URLSearchParams({ orgSlug });
  return postJson<AiDraftResult>(`/api/v1/ai/draft?${q}`, {
    tone: "friendly",
    ...input,
  });
}

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsPage = {
  items: NotificationRow[];
  unreadCount: number;
  nextCursor: string | null;
};

export async function listNotifications(orgSlug: string, unreadOnly = false) {
  const q = new URLSearchParams({ orgSlug, limit: "30" });
  if (unreadOnly) q.set("unread", "1");
  return getJson<NotificationsPage>(`/api/v1/notifications?${q}`);
}

export async function getUnreadNotificationCount(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<{ unreadCount: number }>(`/api/v1/notifications/unread?${q}`);
}

/** Rewrite absolute APP_URL fake-storage uploads to same-origin for the Vite proxy. */
export function sameOriginUploadUrl(uploadUrl: string): string {
  try {
    const u = new URL(uploadUrl, window.location.origin);
    if (u.pathname.startsWith("/api/dev-storage/")) {
      return `${u.pathname}${u.search}`;
    }
  } catch {
    /* keep as-is */
  }
  return uploadUrl;
}

export type AuditRow = {
  id: string;
  createdAt: string;
  action: string;
  actor: { type: string; id: string | null; name: string };
  target: { type: string; id: string };
};

export type AuditPage = { items: AuditRow[]; nextCursor: string | null };

export async function listAuditLog(orgSlug: string, limit = 50) {
  const q = new URLSearchParams({ orgSlug, limit: String(limit) });
  return getJson<AuditPage>(`/api/v1/audit?${q}`);
}

export type { TourBootstrapDTO } from "@/lib/tours/types";

export async function getTourBootstrap(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<import("@/lib/tours/types").TourBootstrapDTO>(`/api/v1/tours?${q}`);
}

export type OverviewKpi = {
  key: string;
  label: string;
  value: number;
  unit: "count" | "percent";
  delta: { value: number; goodWhen: "up" | "down"; suffix?: string } | null;
  series: number[];
};

export type OverviewDTO = {
  hasConnection: boolean;
  hasData: boolean;
  periodLabel: string;
  kpis: OverviewKpi[];
  summary: string;
};

export async function getOverview(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<OverviewDTO>(`/api/v1/overview?${q}`);
}

export type UsageSummary = {
  plan?: string;
  connections?: { id: string; health: "healthy" | "attention" | "down" }[];
  connectionLimit?: number;
  used?: { transactional: number; broadcast: number; inbound: number };
  allowance?: number | null;
  aiCredits?: number | null;
  overageCostUsd?: number | null;
  banner?: {
    kind: "over_allowance" | "trial" | "payment";
    message: string;
    action: { label: string; href: string };
  } | null;
};

export async function getUsageSummary(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<UsageSummary>(`/api/v1/usage/summary?${q}`);
}

export type UsageOverview = {
  plan: { id: string; label: string };
  period: { start: string; end: string; daysElapsed: number; daysTotal: number };
  tracked: { transactional: number; broadcast: number; inbound: number; total: number };
  allowance: number;
  projection: { monthEnd: number; over: number; overageCostUsd: number | null };
  overage: {
    emails: number;
    costUsd: number | null;
    graceEndsAt: string | null;
    graceEnded: boolean;
  };
  ai: {
    enabled: boolean;
    allowance: number;
    used: number;
    packs: number;
  };
  resources: { key: string; label: string; used: number; limit: number | null }[];
};

export async function getSettingsUsage(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<UsageOverview>(`/api/v1/settings/usage?${q}`);
}

export type CleanupRule = {
  id: string;
  name: string;
  enabled: boolean;
  kind: "rule" | "block_sender";
  action: "archive" | "trash" | "delete";
  match: {
    direction?: "inbound" | "outbound";
    fromAddress?: string;
    fromDomain?: string;
    subjectContains?: string;
    olderThanDays?: number;
  };
  lastRunAt: string | null;
  lastRunCount: number;
  createdAt: string;
};

export async function listCleanupRules(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<{ rules: CleanupRule[]; canDelete: boolean }>(`/api/v1/settings/cleanup?${q}`);
}
