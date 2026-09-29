import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const DRAFT_MODES = ["rich", "html", "template"] as const;

const draftSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: "user", required: true, immutable: true },
    senderId: { type: Schema.Types.ObjectId, ref: "senders", default: null },
    threadId: { type: Schema.Types.ObjectId, ref: "threads", default: null },
    inReplyToEmailId: { type: Schema.Types.ObjectId, ref: "emails", default: null },
    to: { type: [String], default: [] },
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    subject: { type: String, default: "" },
    mode: { type: String, enum: DRAFT_MODES, default: "rich" },
    bodyHtml: { type: String, default: "" },
    bodyText: { type: String, default: "" },
    templateId: { type: Schema.Types.ObjectId, ref: "templates", default: null },
    templateVariables: { type: Schema.Types.Mixed, default: {} },
    attachmentIds: { type: [Schema.Types.ObjectId], ref: "attachments", default: [] },
    scheduledAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "drafts", optimisticConcurrency: true, minimize: false },
);

draftSchema.index({ orgId: 1, userId: 1, updatedAt: -1 });

export type Draft = InferSchemaType<typeof draftSchema>;
export type DraftDoc = HydratedDocument<Draft>;

export const DraftModel = (models.Draft as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Draft", draftSchema);
}
