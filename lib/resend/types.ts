/**
 * Wisemail's own view of Resend. The rest of the app never imports the `resend` SDK types, so an
 * SDK upgrade or a fake adapter can't leak through. Resources are camelCased; webhook events keep
 * Resend's wire shape (snake_case) because `webhook_events.payload` stores the original `data`.
 */

export type ResendErrorCode =
  | "resend_rate_limited"
  | "resend_forbidden"
  | "resend_not_found"
  | "resend_validation"
  | "resend_unauthorized"
  /** A send was refused because the sending domain is unverified or unknown to the account. */
  | "resend_domain_rejected"
  | "resend_unknown";

export type PageOptions = { limit?: number; after?: string };
export type Page<T> = { data: T[]; hasMore: boolean; nextCursor?: string };

export type ResendDomainStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "partially_verified"
  | "failed"
  | "temporary_failure"
  | (string & {});

export type ResendDomain = {
  id: string;
  name: string;
  status: ResendDomainStatus;
  region: string;
  createdAt: string;
  openTracking?: boolean;
  clickTracking?: boolean;
  /** Whether the domain can send / receive (`capabilities` in Resend). */
  capabilities?: { sending: boolean; receiving: boolean };
};

export type ResendDnsRecord = {
  /** `SPF`, `DKIM`, `Receiving`, `Tracking`, `TrackingCAA`. */
  record: string;
  type: string;
  name: string;
  value: string;
  ttl?: string;
  priority?: number;
  status: string;
};

/** `domains.get`: the list item plus its DNS records. */
export type ResendDomainDetail = ResendDomain & { records: ResendDnsRecord[] };

export type UpdateDomainInput = {
  id: string;
  openTracking?: boolean;
  clickTracking?: boolean;
};

export type ResendApiKey = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};
// Resend's list endpoint does not return an API key's permission or restricted domain.

export type ResendSegment = { id: string; name: string; createdAt: string };

export type ResendTopic = {
  id: string;
  name: string;
  description: string | null;
  defaultSubscription: "opt_in" | "opt_out";
  createdAt: string;
};

export type ResendContactProperty = {
  id: string;
  key: string;
  type: "string" | "number";
  fallbackValue: string | number | null;
  createdAt: string;
};

export type ResendTemplateVariable = {
  key: string;
  type: "string" | "number";
  fallbackValue: string | number | null;
};

export type ResendTemplateSummary = {
  id: string;
  name: string;
  alias: string | null;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
};

export type ResendTemplate = ResendTemplateSummary & {
  subject: string | null;
  from: string | null;
  replyTo: string[] | null;
  html: string;
  text: string | null;
  variables: ResendTemplateVariable[];
};

export type ResendContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  unsubscribed: boolean;
  createdAt: string;
};

/** `contacts.get`: the list item plus property values keyed by property key. */
export type ResendContactDetail = ResendContact & { properties: Record<string, string | number> };

export type ResendContactTopic = { id: string; subscription: "opt_in" | "opt_out" };

export type ResendBroadcastSummary = {
  id: string;
  name: string;
  segmentId: string | null;
  status: string;
  createdAt: string;
  scheduledAt: string | null;
  sentAt: string | null;
};

export type ResendBroadcast = ResendBroadcastSummary & {
  from: string | null;
  subject: string | null;
  previewText: string | null;
  replyTo: string[] | null;
  topicId: string | null;
  html: string | null;
  text: string | null;
};

export type ResendAutomationSummary = {
  id: string;
  name: string;
  status: "enabled" | "disabled";
  createdAt: string;
  updatedAt: string | null;
};

export type ResendAutomation = ResendAutomationSummary & {
  steps: { key: string; type: string; config: Record<string, unknown> }[];
  connections: { from: string; to: string; type?: string }[];
};

export type ResendWebhookInfo = {
  id: string;
  endpoint: string;
  status: "enabled" | "disabled";
};

export type ResendWebhook = {
  id: string;
  endpoint: string;
  status: "enabled" | "disabled";
  events: ResendEventType[] | null;
  createdAt: string;
};

export type CreatedResendWebhook = {
  id: string;
  /** `whsec_…`, a Svix signing secret. Only returned on creation (and by `get`). */
  signingSecret: string;
};

/* ------------------------------------ sending / inbound ------------------------------------ */

export type SendEmailInput = {
  /** `"Name" <address>` or a bare address. */
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  subject: string;
  html?: string;
  text?: string;
  /** Custom headers, e.g. `In-Reply-To` / `References`. */
  headers?: Record<string, string>;
  /** Names and values: ASCII letters, digits, `_` and `-` only. */
  tags?: { name: string; value: string }[];
  /** `path` is a URL Resend fetches when the email is created. */
  attachments?: { filename: string; path: string; contentType?: string; contentId?: string }[];
  /** ISO 8601. */
  scheduledAt?: string;
};

export type SendEmailResult = {
  /** Resend's email id. */
  id: string;
  /** Present only when the provider reports the generated Message-ID at send time (the fake does). */
  messageId?: string;
};

/** `emails.receiving.get`: metadata plus where to download the raw MIME. */
export type ResendReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  receivedFor: string[];
  subject: string;
  messageId: string;
  createdAt: string;
  html: string | null;
  text: string | null;
  raw: { downloadUrl: string; expiresAt: string } | null;
  attachments: {
    id: string;
    filename: string | null;
    size: number;
    contentType: string;
    contentId: string | null;
    contentDisposition: string | null;
  }[];
};

/** `emails.receiving.attachments.*`: includes the short-lived download URL. */
export type ResendReceivedAttachment = {
  id: string;
  filename: string | null;
  size: number;
  contentType: string;
  contentDisposition: "inline" | "attachment" | null;
  contentId: string | null;
  downloadUrl: string;
  expiresAt: string;
};

/* ---------------------------------- webhook events ---------------------------------- */

export type ResendEventType =
  | "email.sent"
  | "email.scheduled"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.complained"
  | "email.bounced"
  | "email.opened"
  | "email.clicked"
  | "email.received"
  | "email.failed"
  | "email.suppressed"
  | "contact.created"
  | "contact.updated"
  | "contact.deleted"
  | "domain.created"
  | "domain.updated"
  | "domain.deleted"
  | "suppression.added"
  | "suppression.removed";

export type EmailEventData = {
  email_id: string;
  created_at: string;
  message_id?: string;
  from: string;
  to: string[];
  subject: string;
  broadcast_id?: string;
  template_id?: string;
  tags?: Record<string, string>;
};

export type ReceivedEmailEventData = {
  email_id: string;
  created_at: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  received_for: string[];
  message_id: string;
  subject: string;
  attachments: {
    id: string;
    filename: string | null;
    content_type: string;
    content_disposition: string | null;
    content_id: string | null;
  }[];
};

export type ContactEventData = {
  id: string;
  audience_id?: string;
  segment_ids?: string[];
  created_at: string;
  updated_at: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  unsubscribed: boolean;
};

export type DomainEventData = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  region: string;
  records?: {
    record: string;
    name: string;
    type: string;
    ttl: string;
    status: string;
    value: string;
    priority?: number;
  }[];
};

export type SuppressionEventData = {
  id: string;
  email: string;
  origin: "bounce" | "complaint" | "manual";
  source_id: string | null;
  created_at: string;
};

type Envelope<T extends ResendEventType, D> = { type: T; created_at: string; data: D };

export type ResendEvent =
  | Envelope<"email.sent", EmailEventData>
  | Envelope<"email.scheduled", EmailEventData>
  | Envelope<"email.delivered", EmailEventData>
  | Envelope<"email.delivery_delayed", EmailEventData>
  | Envelope<"email.complained", EmailEventData>
  | Envelope<
      "email.bounced",
      EmailEventData & { bounce: { message: string; subType: string; type: string } }
    >
  | Envelope<"email.opened", EmailEventData>
  | Envelope<
      "email.clicked",
      EmailEventData & {
        click: { ipAddress: string; link: string; timestamp: string; userAgent: string };
      }
    >
  | Envelope<"email.received", ReceivedEmailEventData>
  | Envelope<"email.failed", EmailEventData & { failed: { reason: string } }>
  | Envelope<"email.suppressed", EmailEventData & { suppressed: { message: string; type: string } }>
  | Envelope<"contact.created", ContactEventData>
  | Envelope<"contact.updated", ContactEventData>
  | Envelope<"contact.deleted", ContactEventData>
  | Envelope<"domain.created", DomainEventData>
  | Envelope<"domain.updated", DomainEventData>
  | Envelope<"domain.deleted", DomainEventData>
  | Envelope<"suppression.added", SuppressionEventData>
  | Envelope<"suppression.removed", SuppressionEventData>;

export type ResendEventOf<T extends ResendEventType> = Extract<ResendEvent, { type: T }>;
