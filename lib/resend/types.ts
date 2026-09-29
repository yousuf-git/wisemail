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
};

export type ResendApiKey = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
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
