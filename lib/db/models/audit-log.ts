import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

const auditLogSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    actorId: { type: Schema.Types.ObjectId, ref: "user", default: null, immutable: true },
    actorType: { type: String, enum: ["user", "system"], required: true, immutable: true },
    /** e.g. `connection.created`, `email.sent`, `api_key.deleted`, `member.role_changed` */
    action: { type: String, required: true, immutable: true },
    target: {
      type: new Schema(
        {
          type: { type: String, required: true },
          id: { type: Schema.Types.Mixed, required: true },
        },
        { _id: false },
      ),
      required: true,
      immutable: true,
    },
    /** Secrets are never recorded. */
    changes: {
      type: new Schema(
        { before: { type: Schema.Types.Mixed }, after: { type: Schema.Types.Mixed } },
        { _id: false, minimize: false },
      ),
      immutable: true,
    },
    ip: { type: String, immutable: true },
    userAgent: { type: String, immutable: true },
  },
  // Append-only: no updatedAt.
  { timestamps: { createdAt: true, updatedAt: false }, collection: "audit_logs" },
);

auditLogSchema.index({ orgId: 1, createdAt: -1 });
auditLogSchema.index({ orgId: 1, action: 1, createdAt: -1 });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export type AuditLogDoc = HydratedDocument<AuditLog>;

export const AuditLogModel = (models.AuditLog as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("AuditLog", auditLogSchema);
}
