import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const ATTACHMENT_STORAGE_MODES = ["r2", "resend", "none"] as const;
export type AttachmentStorageMode = (typeof ATTACHMENT_STORAGE_MODES)[number];

const attachmentSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    /** Null while attached to a draft. */
    emailId: { type: Schema.Types.ObjectId, ref: "emails", default: null },
    draftId: { type: Schema.Types.ObjectId, ref: "drafts", default: null },
    /** Uploader of a draft attachment. */
    uploadedBy: { type: Schema.Types.ObjectId, ref: "user", default: null },
    direction: { type: String, enum: ["inbound", "outbound"], required: true, immutable: true },
    /** Inbound: Resend's attachment id, used to refresh download URLs. */
    resendAttachmentId: { type: String },
    /** Exact original name (only path separators and control characters removed). */
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, default: 0 },
    contentId: { type: String },
    disposition: { type: String, enum: ["inline", "attachment"], default: "attachment" },
    /** True when the sanitized HTML references this `contentId`. */
    embedded: { type: Boolean, default: false },
    storageMode: { type: String, enum: ATTACHMENT_STORAGE_MODES, required: true },
    storageKey: { type: String, default: null },
    resendDownload: {
      type: new Schema(
        { url: { type: String, required: true }, expiresAt: { type: Date, required: true } },
        { _id: false },
      ),
      default: null,
    },
    availability: { type: String, enum: ["available", "unavailable"], default: "available" },
    /** Draft uploads are `pending` until `confirmUpload` verifies the object. */
    uploadStatus: { type: String, enum: ["pending", "stored", "failed"], default: "stored" },
    /** No TTL index: the `retention` job deletes the R2 object first, then the document. */
    expireAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "attachments" },
);

attachmentSchema.index({ orgId: 1, emailId: 1 });
attachmentSchema.index({ orgId: 1, draftId: 1 });
attachmentSchema.index({ expireAt: 1 });

export type Attachment = InferSchemaType<typeof attachmentSchema>;
export type AttachmentDoc = HydratedDocument<Attachment>;

export const AttachmentModel =
  (models.Attachment as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Attachment", attachmentSchema);
}
