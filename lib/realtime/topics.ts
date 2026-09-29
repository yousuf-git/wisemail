/**
 * Realtime topic names (TRD §2.6). Client-safe: no server imports, so publishers and
 * `useLiveQuery` callers share one spelling.
 *
 * Events are already scoped to an organization by the stream (`realtime_events.orgId`), so topic
 * strings carry no org prefix. The builders accept `orgId` only so call sites read naturally and
 * stay valid if topics ever become org-qualified; it is ignored today. Never treat a topic as
 * an access check: the hub filters by org, user and project scope before a topic is matched.
 */
type Id = string | { toHexString(): string };
/** Org-wide topic: the org id is accepted for call-site symmetry and ignored. */
const orgWide =
  (name: string) =>
  (orgId?: Id): string => {
    void orgId;
    return name;
  };
const hex = (id: Id) => (typeof id === "string" ? id : id.toHexString());

export const topics = {
  threads: orgWide("threads"),
  thread: (id: Id) => `thread:${hex(id)}`,
  emails: orgWide("emails"),
  email: (id: Id) => `email:${hex(id)}`,
  connections: orgWide("connections"),
  connection: (id: Id) => `connection:${hex(id)}`,
  domains: orgWide("domains"),
  senders: orgWide("senders"),
  projects: orgWide("projects"),
  members: orgWide("members"),
  /** User-targeted: only that member's streams receive it (`realtime_events.userId`). */
  access: orgWide("access"),
  notifications: (orgId: Id | undefined, userId: Id) => {
    void orgId;
    return `notifications:${hex(userId)}`;
  },
  incidents: orgWide("incidents"),
  usage: orgWide("usage"),
  /** Anything that changes rollup counters (an email event was processed). */
  insights: orgWide("emails"),
} as const;
