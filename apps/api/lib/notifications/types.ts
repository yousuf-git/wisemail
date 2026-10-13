/**
 * Notification types, who receives them and the defaults (DBD §4.8, PRD §5.6). Client-safe.
 * Only the types listed in `PREFERENCE_TYPES` are produced today and appear in Settings.
 */
export const NOTIFICATION_TYPES = [
  "inbound_received",
  "reply_opened",
  "reply_clicked",
  "bounce",
  "complaint",
  "incident_opened",
  "incident_resolved",
  "connection_attention",
  "domain_changed",
  "sender_unusable",
  "sync_finished",
  "mention",
  "usage_threshold",
  "trial_ending",
  "payment_failed",
  "plan_changed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const PREFERENCE_TYPES = [
  "inbound_received",
  "reply_opened",
  "complaint",
  "bounce",
  "incident_opened",
  "incident_resolved",
  "connection_attention",
  "domain_changed",
] as const satisfies readonly NotificationType[];
export type PreferenceType = (typeof PREFERENCE_TYPES)[number];

export type ChannelPref = { inApp: boolean; email: boolean };

export const PREFERENCE_INFO: Record<
  PreferenceType,
  { label: string; hint: string; group: "Mail" | "Health"; defaults: ChannelPref }
> = {
  inbound_received: {
    label: "New inbound email",
    hint: "Someone wrote to one of your addresses.",
    group: "Mail",
    defaults: { inApp: true, email: false },
  },
  reply_opened: {
    label: "Reply opened",
    hint: "Someone opened an email you sent.",
    group: "Mail",
    defaults: { inApp: true, email: false },
  },
  bounce: {
    label: "Bounces",
    hint: "One notification per bounced email. Can get busy, so it starts off.",
    group: "Mail",
    defaults: { inApp: false, email: false },
  },
  complaint: {
    label: "Spam complaints",
    hint: "A recipient marked an email as spam.",
    group: "Mail",
    defaults: { inApp: true, email: false },
  },
  incident_opened: {
    label: "Alert fired",
    hint: "One of your alert rules found a problem.",
    group: "Health",
    defaults: { inApp: true, email: true },
  },
  incident_resolved: {
    label: "Alert resolved",
    hint: "The problem cleared on its own.",
    group: "Health",
    defaults: { inApp: true, email: false },
  },
  connection_attention: {
    label: "Connection needs attention",
    hint: "A Resend key was revoked or a webhook can't be registered.",
    group: "Health",
    defaults: { inApp: true, email: true },
  },
  domain_changed: {
    label: "Domain status changed",
    hint: "Resend verified a domain or flagged a problem with it.",
    group: "Health",
    defaults: { inApp: true, email: false },
  },
};

export const DIGEST_OPTIONS = ["none", "daily"] as const;
export type DigestSetting = (typeof DIGEST_OPTIONS)[number];

/** Local hour (org time zone) at which the daily digest goes out. */
export const DIGEST_HOUR = 8;

export const defaultChannel = (type: string): ChannelPref =>
  PREFERENCE_INFO[type as PreferenceType]?.defaults ?? { inApp: true, email: false };
