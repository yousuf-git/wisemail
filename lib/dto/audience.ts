/** Plain, client-safe shapes for audience, templates and broadcasts (Phase 6). */

export type ConnectionOptionDTO = {
  id: string;
  name: string;
  /** Active connections accept writes; read-only or broken ones only show mirrors. */
  writable: boolean;
  /** Why writes are off (shown next to the option). */
  note: string | null;
};

export type ContactRowDTO = {
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

export type ContactDetailDTO = ContactRowDTO & {
  properties: Record<string, string | number>;
  segments: { id: string; name: string }[];
  topics: {
    topicId: string;
    name: string;
    subscription: "opt_in" | "opt_out";
    /** True when nothing was set for this contact and the topic default applies. */
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
  /** The connection accepts writes right now. */
  writable: boolean;
  /** Segments, topics and properties of the same connection, for the editors. */
  options: {
    segments: { id: string; name: string }[];
    topics: { id: string; name: string; defaultSubscription: "opt_in" | "opt_out" }[];
    properties: PropertyDTO[];
  };
};

export type SegmentDTO = {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  contactCount: number;
  createdAt: string | null;
};

export type TopicDTO = {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  description: string;
  defaultSubscription: "opt_in" | "opt_out";
};

export type PropertyDTO = {
  id: string;
  connectionId: string;
  connectionName: string;
  key: string;
  type: "string" | "number";
  fallbackValue: string | number | null;
};

export type AudienceOptionsDTO = {
  connections: ConnectionOptionDTO[];
  segments: { id: string; name: string; connectionId: string }[];
  topics: { id: string; name: string; connectionId: string }[];
  properties: { id: string; key: string; type: "string" | "number"; connectionId: string }[];
};

export type TemplateVariableDTO = {
  key: string;
  type: "string" | "number";
  fallback: string | number | null;
};

export type TemplateRowDTO = {
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

export type TemplateDTO = TemplateRowDTO & {
  from: string;
  text: string;
  html: string;
  variables: TemplateVariableDTO[];
  version: number;
  writable: boolean;
};

/** A published template as the composer's Template mode needs it. */
export type TemplateOptionDTO = {
  id: string;
  connectionId: string;
  name: string;
  subject: string;
  html: string;
  variables: TemplateVariableDTO[];
};

export type BroadcastStatsDTO = {
  recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
};

export type BroadcastStatus =
  "draft" | "scheduled" | "queued" | "sending" | "sent" | "canceled" | "failed";

export type BroadcastRowDTO = {
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
  stats: BroadcastStatsDTO | null;
};

export type BroadcastDTO = BroadcastRowDTO & {
  from: string;
  senderId: string | null;
  topicId: string | null;
  topicName: string | null;
  previewText: string;
  html: string;
  text: string;
  templateId: string | null;
  version: number;
  /** Non-blocking problems, e.g. no unsubscribe link. */
  warnings: string[];
  writable: boolean;
};

export type BroadcastAudienceDTO = {
  segmentId: string | null;
  segmentName: string | null;
  /** Contacts in the segment that can receive it (not unsubscribed, not opted out of the topic). */
  recipients: number;
  /** Contacts in the segment in total. */
  inSegment: number;
  unsubscribed: number;
  optedOutOfTopic: number;
};

export type ImportRowInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  properties?: Record<string, string | number>;
};

export type ImportRowError = { row: number; email: string; message: string };

export type ImportBatchResult = {
  /** Rows handled from the start of the batch; fewer than sent when Resend rate-limited us. */
  processed: number;
  rateLimited: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
};

export type ContactImportStatusDTO = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportRowError[];
  errorCount: number;
};

export type BroadcastSenderOptionDTO = {
  id: string;
  connectionId: string;
  address: string;
  displayName: string;
  /** Null when the sender can send. */
  problem: string | null;
};

/** Everything the broadcast editor offers as choices. */
export type BroadcastFormOptionsDTO = {
  connections: ConnectionOptionDTO[];
  segments: { id: string; name: string; connectionId: string; contactCount: number }[];
  topics: { id: string; name: string; connectionId: string }[];
  senders: BroadcastSenderOptionDTO[];
  templates: TemplateOptionDTO[];
};
