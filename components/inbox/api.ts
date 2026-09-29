import type {
  ActivityRowDTO,
  EmailTimelineDTO,
  MailFolder,
  MailListRowDTO,
  Page,
  ThreadDetailDTO,
} from "@/lib/dto/mail";

/** Client fetchers for the `/api/v1` endpoints (session cookie authorizes; org named by slug). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const response = await fetch(`${path}?${search}`, { credentials: "same-origin" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? "Request failed");
  }
  return (await response.json()) as T;
}

export type ThreadListParams = {
  orgSlug: string;
  folder: MailFolder;
  q?: string;
  unread?: boolean;
  /** AI triage category filter (inbox only). */
  category?: string;
};

export const threadListKey = (p: ThreadListParams) =>
  [
    "threads",
    p.orgSlug,
    p.folder,
    p.q ?? "",
    p.unread ? "unread" : "all",
    p.category ?? "",
  ] as const;

export const fetchThreadList = (p: ThreadListParams, cursor: string | null) =>
  getJson<Page<MailListRowDTO>>("/api/v1/threads", {
    orgSlug: p.orgSlug,
    folder: p.folder,
    q: p.q?.trim() || undefined,
    unread: p.unread ? "1" : undefined,
    category: p.category || undefined,
    cursor: cursor ?? undefined,
    limit: "30",
  });

export const threadKey = (orgSlug: string, threadId: string) =>
  ["thread", orgSlug, threadId] as const;

export const fetchThread = (orgSlug: string, threadId: string) =>
  getJson<ThreadDetailDTO>(`/api/v1/threads/${threadId}`, { orgSlug });

export type ActivityFilterState = {
  q: string;
  status: string;
  direction: string;
  connectionId: string;
  domainId: string;
  from: string;
  to: string;
};

export const EMPTY_ACTIVITY_FILTERS: ActivityFilterState = {
  q: "",
  status: "",
  direction: "",
  connectionId: "",
  domainId: "",
  from: "",
  to: "",
};

const looksLikeAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const activityKey = (orgSlug: string, f: ActivityFilterState) =>
  ["activity", orgSlug, f] as const;

/** Query parameters for `/api/v1/activity` (also used to build the server-rendered first page). */
export function activityParams(f: ActivityFilterState): Record<string, string | undefined> {
  const q = f.q.trim();
  return {
    // An address is a recipient lookup (everything sent to or received from it); other text is full-text search.
    q: q && !looksLikeAddress(q) ? q : undefined,
    recipient: looksLikeAddress(q) ? q : undefined,
    status: f.status || undefined,
    direction: f.direction || undefined,
    connectionId: f.connectionId || undefined,
    domainId: f.domainId || undefined,
    from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : undefined,
    to: f.to ? new Date(`${f.to}T23:59:59.999`).toISOString() : undefined,
  };
}

export const fetchActivity = (orgSlug: string, f: ActivityFilterState, cursor: string | null) =>
  getJson<Page<ActivityRowDTO>>("/api/v1/activity", {
    orgSlug,
    ...activityParams(f),
    cursor: cursor ?? undefined,
    limit: "50",
  });

export const fetchTimeline = (orgSlug: string, emailId: string) =>
  getJson<EmailTimelineDTO>(`/api/v1/activity/${emailId}`, { orgSlug });
