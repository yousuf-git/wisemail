import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { EncryptedValueSchema } from "./shared";

export const CONNECTION_STATUSES = [
  "provisioning",
  "active",
  "needs_attention",
  "read_only",
  "disabled",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

const planQuota = new Schema(
  {
    transactional: {
      type: new Schema({ monthlyEmails: Number, dailyEmails: Number }, { _id: false }),
    },
    marketing: { type: new Schema({ contacts: Number }, { _id: false }) },
  },
  { _id: false },
);

const connectionSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    name: { type: String, required: true, trim: true },
    provider: { type: String, enum: ["resend"], required: true, default: "resend" },
    /** Wiped (unset) when the connection is removed. */
    apiKey: { type: EncryptedValueSchema },
    apiKeyLast4: { type: String },
    /** HMAC of the Resend team identity; blocks connecting the same team twice in one org. */
    resendTeamFingerprint: { type: String, required: true },
    webhook: {
      type: new Schema(
        {
          resendId: { type: String, required: true },
          signingSecret: { type: EncryptedValueSchema, required: true },
          events: { type: [String], required: true },
          registeredAt: { type: Date, required: true },
        },
        { _id: false },
      ),
    },
    status: { type: String, enum: CONNECTION_STATUSES, required: true, default: "provisioning" },
    statusReason: { type: String },
    lastEventAt: { type: Date },
    lastSyncAt: { type: Date },
    planQuota: { type: planQuota },
    checklist: {
      type: [
        new Schema(
          {
            key: { type: String, required: true },
            status: { type: String, enum: ["ok", "warn", "fail"], required: true },
            checkedAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "user", required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "connections" },
);

// Uniqueness only among live connections, so a removed connection frees its name and its team.
const live = { deletedAt: { $type: "null" } } as const;
connectionSchema.index({ orgId: 1, name: 1 }, { unique: true, partialFilterExpression: live });
connectionSchema.index(
  { orgId: 1, resendTeamFingerprint: 1 },
  { unique: true, partialFilterExpression: live },
);
connectionSchema.index({ orgId: 1, status: 1 });

export type Connection = InferSchemaType<typeof connectionSchema>;
export type ConnectionDoc = HydratedDocument<Connection>;

export const ConnectionModel =
  (models.Connection as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Connection", connectionSchema);
}
