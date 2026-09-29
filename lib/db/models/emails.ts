import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const EMAIL_STATUSES = [
  "draft",
  "queued",
  "scheduled",
  "sent",
  "delivered",
  "delivery_delayed",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "failed",
  "suppressed",
  "canceled",
  "received",
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const EMAIL_DIRECTIONS = ["outbound", "inbound"] as const;
export const EMAIL_ORIGINS = ["app", "external", "broadcast"] as const;
export const CONTENT_STATUSES = ["pending", "ready", "failed", "unavailable"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Days an email stays in Trash before `purge-trash` may delete it (TRD §2.14). */
export const TRASH_RETENTION_DAYS = 30;

const addressSchema = new Schema(
  { address: { type: String, required: true }, name: { type: String } },
  { _id: false },
);

const emailSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    connectionId: {
      type: Schema.Types.ObjectId,
      ref: "connections",
      required: true,
      immutable: true,
    },
    /** Null until Resend accepts an outbound send. */
    resendId: { type: String, default: null },
    direction: { type: String, enum: EMAIL_DIRECTIONS, required: true, immutable: true },
    origin: { type: String, enum: EMAIL_ORIGINS, required: true, default: "external" },
    domainId: { type: Schema.Types.ObjectId, ref: "domains", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "projects", default: null },
    senderId: { type: Schema.Types.ObjectId, ref: "senders", default: null },
    threadId: { type: Schema.Types.ObjectId, ref: "threads", default: null },
    broadcastId: { type: Schema.Types.ObjectId, ref: "broadcasts", default: null },
    templateId: { type: Schema.Types.ObjectId, ref: "templates", default: null },
    /** Values the sender filled in for a template send (Phase 6); the template renders them. */
    templateVariables: { type: Schema.Types.Mixed, select: false },
    authorId: { type: Schema.Types.ObjectId, ref: "user", default: null },
    /** RFC 5322 Message-ID, angle brackets included. */
    messageId: { type: String },
    inReplyTo: { type: String },
    references: { type: [String], default: [] },
    from: { type: addressSchema, required: true },
    to: { type: [addressSchema], default: [] },
    cc: { type: [addressSchema], default: [] },
    bcc: { type: [addressSchema], default: [] },
    replyTo: { type: [addressSchema], default: [] },
    /** Lowercased union of to/cc/bcc, for recipient lookup. */
    recipientAddresses: { type: [String], default: [] },
    subject: { type: String, default: "" },
    snippet: { type: String, default: "" },
    tags: {
      type: [new Schema({ name: String, value: String }, { _id: false })],
      default: [],
    },
    hasAttachments: { type: Boolean, default: false },
    status: { type: String, enum: EMAIL_STATUSES, required: true },
    bounce: {
      type: new Schema(
        {
          type: { type: String, enum: ["hard", "soft"], required: true },
          subType: String,
          message: String,
        },
        { _id: false },
      ),
    },
    scheduledAt: Date,
    sentAt: Date,
    deliveredAt: Date,
    firstOpenedAt: Date,
    lastOpenedAt: Date,
    firstClickedAt: Date,
    bouncedAt: Date,
    complainedAt: Date,
    receivedAt: Date,
    openCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    likelyAutomatedOpen: { type: Boolean, default: false },
    /** Inbound fetch state. */
    contentStatus: { type: String, enum: CONTENT_STATUSES },
    sendError: {
      type: new Schema({ code: String, message: String }, { _id: false }),
    },
    /** Set once when counted toward `usage_periods` (metering hook, Phase 7). */
    meteredAt: { type: Date, default: null },
    overAllowance: { type: Boolean, default: false },
    trashedAt: { type: Date, default: null },
    trashedBy: { type: Schema.Types.ObjectId, ref: "user", default: null },
    trashedByRuleId: { type: Schema.Types.ObjectId, default: null },
    /** The `bulk_operations` document that trashed it (its Undo restores by this id). */
    trashedByOpId: { type: Schema.Types.ObjectId, default: null },
    purgeAt: { type: Date, default: null },
    /** Plan retention TTL (documents own no R2 objects here, so a TTL index is fine). */
    expireAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "emails" },
);

// (connectionId, resendId) is unique only once Resend has assigned an id.
emailSchema.index(
  { connectionId: 1, resendId: 1 },
  { unique: true, partialFilterExpression: { resendId: { $type: "string" } } },
);
emailSchema.index({ orgId: 1, direction: 1, createdAt: -1 });
emailSchema.index({ orgId: 1, projectId: 1, createdAt: -1 });
emailSchema.index({ orgId: 1, recipientAddresses: 1, createdAt: -1 });
emailSchema.index({ orgId: 1, threadId: 1, createdAt: 1 });
emailSchema.index({ orgId: 1, messageId: 1 });
emailSchema.index({ orgId: 1, status: 1, scheduledAt: 1 });
// Search (MVP, TRD §7). orgId is an equality prefix, so every search is tenant-scoped.
emailSchema.index(
  { orgId: 1, subject: "text", snippet: "text", "from.address": "text" },
  { name: "emails_text" },
);
emailSchema.index(
  { orgId: 1, trashedAt: -1 },
  { partialFilterExpression: { trashedAt: { $type: "date" } } },
);
emailSchema.index(
  { orgId: 1, trashedByOpId: 1 },
  { partialFilterExpression: { trashedByOpId: { $type: "objectId" } } },
);
emailSchema.index({ purgeAt: 1 }, { partialFilterExpression: { purgeAt: { $type: "date" } } });
emailSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type Email = InferSchemaType<typeof emailSchema>;
export type EmailDoc = HydratedDocument<Email>;

export const EmailModel = (models.Email as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Email", emailSchema);
}
