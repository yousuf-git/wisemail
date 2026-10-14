import type { TriageDTO } from "@wisemail/shared";
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

export type Address = { address: string; name?: string };

export type Attachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  disposition: "inline" | "attachment";
  embedded: boolean;
  available: boolean;
  downloadUrl: string;
  thumbnailUrl: string | null;
};

export type ReceiptEvent = { type: string; at: string };

export type ReceiptSummary = {
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  firstClickedAt: string | null;
  clickCount: number;
  likelyAutomatedOpen: boolean;
  opensTracked: boolean;
  bounce: { type: "hard" | "soft"; message: string | null } | null;
  events: ReceiptEvent[];
};

/** Mirrors `MailListRowDTO` from the API DTO. */
export type MailListRow = {
  kind: "thread" | "email";
  id: string;
  threadId: string | null;
  subject: string;
  snippet: string;
  people: string[];
  peopleLabels?: string[];
  lastMessageAt: string;
  messageCount: number;
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
  projectId: string | null;
  status: string | null;
  scheduledAt: string | null;
  trashedAt: string | null;
  purgeAt: string | null;
  ai?: TriageDTO | null;
};

export type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  from: Address;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  snippet: string;
  at: string;
  scheduledAt: string | null;
  authorId: string | null;
  contentStatus: "pending" | "ready" | "failed" | "unavailable" | null;
  html: string | null;
  text: string | null;
  attachments: Attachment[];
  receipts: ReceiptSummary | null;
};

export type ThreadDetail = {
  id: string;
  subject: string;
  mailboxAddress: string;
  participants: string[];
  messageCount: number;
  starred: boolean;
  archived: boolean;
  assigneeId: string | null;
  unread: boolean;
  projectId: string | null;
  ai?: TriageDTO | null;
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

export type MailFolder = "inbox" | "sent" | "scheduled" | "trash";

export type ThreadListParams = {
  orgSlug: string;
  folder: MailFolder;
  q?: string;
  unread?: boolean;
  category?: string;
  cursor?: string | null;
  limit?: number;
};

export async function listThreads(params: ThreadListParams) {
  const q = new URLSearchParams({
    orgSlug: params.orgSlug,
    folder: params.folder,
    limit: String(params.limit ?? 30),
  });
  if (params.q?.trim()) q.set("q", params.q.trim());
  if (params.unread) q.set("unread", "1");
  if (params.category) q.set("category", params.category);
  if (params.cursor) q.set("cursor", params.cursor);
  return getJson<ThreadListPage>(`/api/v1/threads?${q}`);
}

export const listInboxThreads = (orgSlug: string, limit = 30) =>
  listThreads({ orgSlug, folder: "inbox", limit });

export type GeneralSettings = { name: string; slug: string; timezone: string };

export async function getGeneralSettings(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<GeneralSettings>(`/api/v1/settings/general?${q}`);
}

export type SenderStatus =
  | "active"
  | "domain_unverified"
  | "connection_inactive"
  | "disabled";

export type Sender = {
  id: string;
  domainId: string;
  connectionId: string;
  domainName: string;
  projectId: string | null;
  localPart: string;
  address: string;
  displayName: string;
  replyTo: string[];
  signatureHtml: string;
  isDefault: boolean;
  status: SenderStatus;
  statusReason: string | null;
  canReceiveReplies: boolean;
  receivingNote: string | null;
  version: number;
};

export type SenderDomainOption = {
  id: string;
  name: string;
  receiving: boolean;
};

export type SendersPagePayload = {
  senders: Sender[];
  domains: SenderDomainOption[];
  can: {
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
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
  return getJson<SendersPagePayload>(`/api/v1/senders?${q}`);
}

export type ActivityRow = {
  id: string;
  direction: "inbound" | "outbound";
  origin: "app" | "external" | "broadcast";
  status: string;
  connectionId: string;
  domainId: string | null;
  projectId: string | null;
  from: { name?: string; address: string };
  to: string[];
  subject: string;
  tags: { name: string; value: string }[];
  openCount: number;
  clickCount: number;
  at: string;
  threadId: string | null;
};

export type ActivityPage = { items: ActivityRow[]; nextCursor: string | null };

export type ActivityFilters = {
  q?: string;
  status?: string;
  direction?: "inbound" | "outbound" | "";
  connectionId?: string;
  domainId?: string;
  cursor?: string | null;
  limit?: number;
};

export async function listActivity(orgSlug: string, filters: ActivityFilters = {}) {
  const q = new URLSearchParams({ orgSlug, limit: String(filters.limit ?? 30) });
  if (filters.q) q.set("q", filters.q);
  if (filters.status) q.set("status", filters.status);
  if (filters.direction) q.set("direction", filters.direction);
  if (filters.connectionId) q.set("connectionId", filters.connectionId);
  if (filters.domainId) q.set("domainId", filters.domainId);
  if (filters.cursor) q.set("cursor", filters.cursor);
  return getJson<ActivityPage>(`/api/v1/activity?${q}`);
}

export type TimelineEntry = {
  id: string;
  type: string;
  occurredAt: string;
  payload: unknown;
};

export type EmailTimeline = {
  email: ActivityRow;
  entries: TimelineEntry[];
};

export async function getActivityEmail(orgSlug: string, emailId: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<EmailTimeline>(`/api/v1/activity/${encodeURIComponent(emailId)}?${q}`);
}

export type ContactRow = {
  id: string;
  connectionId: string;
  connectionName: string;
  email: string;
  firstName: string;
  lastName: string;
  unsubscribed: boolean;
  segmentIds: string[];
  createdAt: string;
};

export type ContactDetail = ContactRow & {
  properties: Record<string, string | number>;
  segments: { id: string; name: string }[];
  topics: {
    topicId: string;
    name: string;
    subscription: "opt_in" | "opt_out";
    isDefault: boolean;
  }[];
  engagement: {
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    lastSentAt: string | null;
    lastOpenedAt: string | null;
  };
  recentEmails: {
    id: string;
    subject: string;
    status: string;
    direction: "inbound" | "outbound";
    at: string;
  }[];
  writable: boolean;
  options: {
    segments: { id: string; name: string }[];
    topics: { id: string; name: string; defaultSubscription: "opt_in" | "opt_out" }[];
    properties: PropertyRow[];
  };
};

export type ContactPage = { items: ContactRow[]; nextCursor: string | null };

export type ContactFilters = {
  q?: string;
  connectionId?: string;
  segmentId?: string;
  topicId?: string;
  status?: "" | "subscribed" | "unsubscribed";
  cursor?: string | null;
  limit?: number;
};

export async function listContacts(orgSlug: string, filters: ContactFilters = {}) {
  const q = new URLSearchParams({ orgSlug, limit: String(filters.limit ?? 50) });
  if (filters.q?.trim()) q.set("q", filters.q.trim());
  if (filters.connectionId) q.set("connectionId", filters.connectionId);
  if (filters.segmentId) q.set("segmentId", filters.segmentId);
  if (filters.topicId) q.set("topicId", filters.topicId);
  if (filters.status) q.set("status", filters.status);
  if (filters.cursor) q.set("cursor", filters.cursor);
  return getJson<ContactPage>(`/api/v1/contacts?${q}`);
}

export async function getContact(orgSlug: string, contactId: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<ContactDetail>(`/api/v1/contacts/${encodeURIComponent(contactId)}?${q}`);
}

export type AudienceOptions = {
  connections: { id: string; name: string; writable: boolean; note: string | null }[];
  segments: { id: string; name: string; connectionId: string }[];
  topics: { id: string; name: string; connectionId: string }[];
  properties: { id: string; key: string; type: "string" | "number"; connectionId: string }[];
};

export async function getAudienceOptions(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<AudienceOptions>(`/api/v1/audience/options?${q}`);
}

export type SegmentRow = {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  contactCount: number;
  createdAt: string | null;
};

export async function listSegments(orgSlug: string, connectionId?: string) {
  const q = new URLSearchParams({ orgSlug });
  if (connectionId) q.set("connectionId", connectionId);
  return getJson<SegmentRow[]>(`/api/v1/segments?${q}`);
}

export type TopicRow = {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  description: string;
  defaultSubscription: "opt_in" | "opt_out";
};

export async function listTopics(orgSlug: string, connectionId?: string) {
  const q = new URLSearchParams({ orgSlug });
  if (connectionId) q.set("connectionId", connectionId);
  return getJson<TopicRow[]>(`/api/v1/topics?${q}`);
}

export type PropertyRow = {
  id: string;
  connectionId: string;
  connectionName: string;
  key: string;
  type: "string" | "number";
  fallbackValue: string | number | null;
};

export async function listProperties(orgSlug: string, connectionId?: string) {
  const q = new URLSearchParams({ orgSlug });
  if (connectionId) q.set("connectionId", connectionId);
  return getJson<PropertyRow[]>(`/api/v1/properties?${q}`);
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

export type DnsVerdict = "pass" | "fail" | "missing" | "unknown" | "skipped";

export type DnsRecord = {
  record: string;
  type: string;
  name: string;
  value: string;
  priority: number | null;
  status: string;
};

export type DnsCheck = {
  checkedAt: string;
  spf: DnsVerdict;
  dkim: DnsVerdict;
  dmarc: DnsVerdict;
  mx: DnsVerdict;
  details: {
    group: "spf" | "dkim" | "dmarc" | "mx";
    type: string;
    name: string;
    expected: string;
    found: string[];
    verdict: DnsVerdict;
    message: string;
  }[];
};

export type DomainRow = {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  status: string;
  region: string | null;
  openTracking: boolean;
  clickTracking: boolean;
  receivingEnabled: boolean;
  receivingVerified: boolean;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  records: DnsRecord[];
  dnsCheck: DnsCheck | null;
  senderCount: number;
  createdAt: string | null;
};

export type DomainProjectChoice = { id: string; name: string; color: string };

export type DomainsListPayload = {
  domains: DomainRow[];
  projects: DomainProjectChoice[];
  connections: { id: string; name: string }[];
  projectRequired: boolean;
  can: { create: boolean; update: boolean; assignProject: boolean };
};

export type DomainDetailPayload = {
  domain: DomainRow;
  projects: DomainProjectChoice[];
  can: {
    update: boolean;
    verify: boolean;
    delete: boolean;
    assignProject: boolean;
  };
};

export async function listDomains(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<DomainsListPayload>(`/api/v1/domains?${q}`);
}

export async function getDomain(orgSlug: string, domainId: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<DomainDetailPayload>(`/api/v1/domains/${encodeURIComponent(domainId)}?${q}`);
}

export const MEMBER_ROLES = ["owner", "admin", "developer", "support", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  support: "Support",
  viewer: "Viewer",
};

export const ROLE_BLURBS: Record<MemberRole, string> = {
  owner: "Everything, including billing.",
  admin: "Manages members, projects and connections.",
  developer: "Sends email, manages senders and audience.",
  support: "Works the inbox.",
  viewer: "Read-only.",
};

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: MemberRole;
  joinedAt: string;
  projectIds: string[] | null;
  isYou: boolean;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  expiresInDays: number;
  link: string | null;
  emailSent: boolean | null;
  projectIds: string[];
};

export type MemberQuota = {
  used: number;
  limit: number | null;
  planLabel: string;
  nextTierLabel: string | null;
  scopesAllowed: boolean;
};

export type MemberProjectOption = {
  id: string;
  name: string;
  color: ProjectColor;
};

export type MembersPagePayload = {
  members: MemberRow[];
  invitations: InvitationRow[];
  quota: MemberQuota;
  projects: MemberProjectOption[];
  actorRole: MemberRole;
  can: {
    read: boolean;
    invite: boolean;
    update: boolean;
    delete: boolean;
  };
};

export async function listMembersBundle(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<MembersPagePayload>(`/api/v1/members?${q}`);
}

export type ApiKeyPermission = "full_access" | "sending_access";

export type ApiKeyRow = {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  permission: ApiKeyPermission | null;
  domainId: string | null;
  domainName: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  createdViaApp: boolean;
  inUse: "exact" | "possible" | null;
  connectionKeyLast4: string | null;
  stale: boolean;
};

export type ApiKeyConnectionOption = {
  id: string;
  name: string;
  domains: { id: string; name: string }[];
};

export type ApiKeysPagePayload = {
  keys: ApiKeyRow[];
  connections: ApiKeyConnectionOption[];
  can: {
    read: boolean;
    create: boolean;
    createSending: boolean;
    delete: boolean;
  };
};

export type CreatedApiKey = {
  key: ApiKeyRow;
  secret: string;
};

export async function listApiKeys(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<ApiKeysPagePayload>(`/api/v1/api-keys?${q}`);
}

export type IncidentRow = {
  id: string;
  ruleId: string;
  ruleName: string;
  kind: string;
  status: "open" | "resolved" | "acknowledged";
  title: string;
  summary: string;
  observedValue: number;
  openedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  context: {
    connectionId?: string;
    connectionName?: string;
    domainId?: string;
    domainName?: string;
    threshold?: number;
    windowMinutes?: number;
    volume?: number;
    sampleEmailIds?: string[];
  };
  aiExplanation?: { text: string; generatedAt: string | null } | null;
};

export type IncidentDetailPayload = {
  incident: IncidentRow;
  can: { acknowledge: boolean };
};

export async function listIncidents(orgSlug: string, status: "active" | "all" = "active") {
  const q = new URLSearchParams({ orgSlug, status });
  return getJson<IncidentRow[]>(`/api/v1/incidents?${q}`);
}

export async function getIncident(orgSlug: string, incidentId: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<IncidentDetailPayload>(
    `/api/v1/incidents/${encodeURIComponent(incidentId)}?${q}`,
  );
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

export type InsightRange = 7 | 30 | 90;
export type InsightStream = "transactional" | "broadcast" | "inbound";

export type InsightFilters = {
  connectionId?: string;
  domainId?: string;
  projectId?: string;
  stream?: InsightStream;
};

export type InsightCounts = {
  sent: number;
  delivered: number;
  delayed: number;
  opened: number;
  clicked: number;
  bouncedHard: number;
  bouncedSoft: number;
  bounced: number;
  complained: number;
  failed: number;
  suppressed: number;
  received: number;
  replied: number;
};

export type InsightRates = {
  delivered: number | null;
  opened: number | null;
  clicked: number | null;
  bounced: number | null;
  complained: number | null;
};

export type InsightPoint = {
  date: string;
  counts: InsightCounts;
  rates: InsightRates;
};

export type InsightDomainRow = {
  domainId: string | null;
  name: string;
  counts: InsightCounts;
  rates: InsightRates;
  bounceTrend: number[];
};

export type InsightsDTO = {
  days: InsightRange;
  timezone: string;
  filters: InsightFilters;
  hasData: boolean;
  totals: InsightCounts;
  rates: InsightRates;
  previous: { counts: InsightCounts; rates: InsightRates };
  deltas: {
    sent: number | null;
    received: number | null;
    rates: InsightRates;
  };
  series: InsightPoint[];
  domains: InsightDomainRow[];
  generatedAt: string;
};

export type InsightFilterOptions = {
  hasConnection: boolean;
  connections: { id: string; name: string }[];
  domains: { id: string; name: string; connectionId: string; projectId: string | null }[];
  projects: { id: string; name: string }[];
};

export async function getInsights(
  orgSlug: string,
  days: InsightRange = 7,
  filters: InsightFilters = {},
) {
  const q = new URLSearchParams({ orgSlug, days: String(days) });
  for (const [k, v] of Object.entries(filters)) {
    if (v) q.set(k, v);
  }
  return getJson<InsightsDTO>(`/api/v1/insights?${q}`);
}

export async function getInsightFilterOptions(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<InsightFilterOptions>(`/api/v1/insights/options?${q}`);
}

export type BroadcastStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "sending"
  | "sent"
  | "canceled"
  | "failed";

export type BroadcastStats = {
  recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
};

export type BroadcastRow = {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  subject: string;
  status: BroadcastStatus;
  segmentId: string | null;
  segmentName: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  updatedAt: string;
  stats: BroadcastStats | null;
};

export type BroadcastDetail = BroadcastRow & {
  from: string;
  senderId: string | null;
  topicId: string | null;
  topicName: string | null;
  previewText: string;
  html: string;
  text: string;
  templateId: string | null;
  version: number;
  warnings: string[];
  writable: boolean;
};

export type BroadcastListPayload = {
  broadcasts: BroadcastRow[];
  connections: { id: string; name: string; writable: boolean; note: string | null }[];
  can: { create: boolean; send: boolean };
};

export type BroadcastFormOptions = {
  connections: { id: string; name: string; writable: boolean; note: string | null }[];
  segments: { id: string; name: string; connectionId: string; contactCount: number }[];
  topics: { id: string; name: string; connectionId: string }[];
  senders: {
    id: string;
    connectionId: string;
    address: string;
    displayName: string;
    problem: string | null;
  }[];
  templates: TemplateOption[];
};

export async function listBroadcasts(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<BroadcastListPayload>(`/api/v1/broadcasts?${q}`);
}

export async function getBroadcast(orgSlug: string, broadcastId: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<BroadcastDetail>(`/api/v1/broadcasts/${encodeURIComponent(broadcastId)}?${q}`);
}

export async function getBroadcastOptions(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<BroadcastFormOptions>(`/api/v1/broadcasts/options?${q}`);
}

export type TemplateVariable = {
  key: string;
  type: "string" | "number";
  fallback: string | number | null;
};

export type TemplateRow = {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  alias: string;
  status: "draft" | "published";
  subject: string;
  variableCount: number;
  updatedAt: string;
};

export type TemplateDetail = TemplateRow & {
  from: string;
  text: string;
  html: string;
  variables: TemplateVariable[];
  version: number;
  writable: boolean;
};

export type TemplateListPayload = {
  templates: TemplateRow[];
  connections: { id: string; name: string; writable: boolean; note: string | null }[];
  can: { create: boolean; update: boolean; delete: boolean };
};

export async function listTemplates(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<TemplateListPayload>(`/api/v1/templates?${q}`);
}

export async function getTemplate(orgSlug: string, templateId: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<TemplateDetail>(`/api/v1/templates/${encodeURIComponent(templateId)}?${q}`);
}

export const PROJECT_COLORS = [
  "accent",
  "engaged",
  "success",
  "warning",
  "coral",
  "danger",
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const PROJECT_COLOR_CLASS: Record<ProjectColor, string> = {
  accent: "bg-accent",
  engaged: "bg-engaged",
  success: "bg-success",
  warning: "bg-warning",
  coral: "bg-coral",
  danger: "bg-danger",
};

export type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  color: ProjectColor;
  description: string;
  domainCount: number;
  scopedMemberCount: number;
  createdAt?: string;
};

export type ProjectQuota = {
  used: number;
  limit: number | null;
  planLabel: string;
  nextTierLabel: string | null;
};

export type ProjectsPagePayload = {
  projects: ProjectRow[];
  quota: ProjectQuota;
  can: {
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
};

export async function listProjects(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<ProjectsPagePayload>(`/api/v1/projects?${q}`);
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

export type BillingPlanId = "free" | "pro" | "team" | "agency";

export type BillingPlanCard = {
  id: BillingPlanId;
  label: string;
  tagline: string;
  priceMonthly: number;
  priceAnnualPerMonth: number;
  highlights: string[];
  overage: string | null;
};

export type PlanChangePreview = {
  toPlan: BillingPlanId;
  toLabel: string;
  direction: "upgrade" | "downgrade" | "convert" | "same";
  effectiveAt: string;
  readOnlyConnections: string[];
  lostFeatures: string[];
  retention: { from: number; to: number; effectiveAt: string } | null;
  memberOverLimit: number;
};

export type BillingOverview = {
  billingEnabled: boolean;
  currentPlan: BillingPlanId;
  currentLabel: string;
  planState: string;
  trial: { active: boolean; endsAt: string; daysLeft: number } | null;
  trialAvailable: boolean;
  pendingChange: {
    toPlan: BillingPlanId;
    toLabel: string;
    effectiveAt: string;
    scheduled: boolean;
    retentionEffectiveAt: string | null;
    retentionTo: number | null;
  } | null;
  canManage: boolean;
  plans: BillingPlanCard[];
  priceMigration: {
    planLabel: string;
    interval: "month" | "year";
    oldPriceUsd: number;
    newPriceUsd: number;
    renewsAt: string | null;
    message: string;
  } | null;
  stripe: {
    fake: boolean;
    interval: "month" | "year" | null;
    hasSubscription: boolean;
    renewsAt: string | null;
    cancelAtPeriodEnd: boolean;
    payment: { pastDue: boolean; graceEndsAt: string | null };
    extraConnections: {
      quantity: number;
      included: number;
      unitUsd: number;
      monthlyUsd: number;
    } | null;
    creditPack: {
      credits: number;
      priceUsd: number;
      available: boolean;
      balance: number;
      maxPacks: number;
    };
    overage: string | null;
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
  nextTierLabel: string | null;
};

export async function getAiStatus(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<AiStatus>(`/api/v1/ai/status?${q}`);
}

export type AiUsageFeature = "triage" | "draft" | "compose" | "anomaly";

export type AiUsageSummary = {
  periodStart: string;
  byFeature: Record<AiUsageFeature, { calls: number; credits: number }>;
  rows: {
    id: string;
    at: string;
    feature: AiUsageFeature;
    member: string | null;
    model: string;
    tokens: number;
    credits: number;
  }[];
};

export async function getAiUsage(orgSlug: string, limit = 25) {
  const q = new URLSearchParams({ orgSlug, limit: String(limit) });
  return getJson<AiUsageSummary>(`/api/v1/ai/usage?${q}`);
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

export type AiExplainResult = { text: string; generatedAt: string; cached: boolean };

export async function aiExplainIncident(
  orgSlug: string,
  input: { incidentId: string; refresh?: boolean },
) {
  const q = new URLSearchParams({ orgSlug });
  return postJson<AiExplainResult>(`/api/v1/ai/explain?${q}`, input);
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
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  ip: string | null;
  userAgent: string | null;
};

export type AuditPage = { items: AuditRow[]; nextCursor: string | null };

export type AuditFilters = {
  actions: string[];
  targetTypes: string[];
  actors: { id: string; name: string }[];
  windowDays: number;
};

export type AuditQueryParams = {
  actor?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  cursor?: string | null;
  limit?: number;
};

function auditSearchParams(orgSlug: string, filters: AuditQueryParams = {}) {
  const q = new URLSearchParams({ orgSlug });
  if (filters.limit) q.set("limit", String(filters.limit));
  if (filters.cursor) q.set("cursor", filters.cursor);
  if (filters.actor) q.set("actor", filters.actor);
  if (filters.action) q.set("action", filters.action);
  if (filters.targetType) q.set("targetType", filters.targetType);
  if (filters.from) q.set("from", filters.from);
  if (filters.to) q.set("to", filters.to);
  return q;
}

export async function getAuditFilters(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<AuditFilters>(`/api/v1/audit/filters?${q}`);
}

export async function listAuditLog(orgSlug: string, filters: AuditQueryParams = {}) {
  const q = auditSearchParams(orgSlug, { limit: 50, ...filters });
  return getJson<AuditPage>(`/api/v1/audit?${q}`);
}

/** Download audit CSV with session cookies (works with `VITE_API_URL` split). */
export async function downloadAuditExport(orgSlug: string, filters: AuditQueryParams = {}) {
  const q = auditSearchParams(orgSlug, filters);
  const res = await fetch(apiUrl(`/api/v1/audit/export?${q}`), {
    credentials: "include",
    headers: { accept: "text/csv" },
  });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (typeof body.message === "string") message = body.message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wisemail-audit-${orgSlug}-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  scope: { connectionIds: string[]; projectIds: string[]; mailboxAddresses: string[] };
  match: {
    direction?: "inbound" | "outbound";
    fromAddress?: string;
    fromDomain?: string;
    subjectContains?: string;
    tag?: { name: string; value?: string };
    aiCategory?: string;
    olderThanDays?: number;
  };
  lastRunAt: string | null;
  lastRunCount: number;
  createdAt: string;
};

export type CleanupRuleInput = {
  name: string;
  kind: "rule" | "block_sender";
  action: "archive" | "trash" | "delete";
  enabled?: boolean;
  scope?: {
    connectionIds?: string[];
    projectIds?: string[];
    mailboxAddresses?: string[];
  };
  match?: CleanupRule["match"];
};

export async function listCleanupRules(orgSlug: string) {
  const q = new URLSearchParams({ orgSlug });
  return getJson<{ rules: CleanupRule[]; canDelete: boolean }>(`/api/v1/settings/cleanup?${q}`);
}
