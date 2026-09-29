import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

/** Heavy bodies live apart from `emails` so list views stay small (DBD §1 rule 5). */
const emailContentSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    emailId: { type: Schema.Types.ObjectId, ref: "emails", required: true, immutable: true },
    /** Sanitized HTML with `cid:` references intact; replaced with signed URLs at render time. */
    html: { type: String },
    text: { type: String },
    /**
     * Outbound only: the composed message exactly as it will be sent (not sanitized), kept until
     * Resend accepts the email and removed afterwards.
     */
    sourceHtml: { type: String },
    sourceText: { type: String },
    headers: {
      type: [new Schema({ name: String, value: String }, { _id: false })],
      default: [],
    },
    /** R2 key of the raw MIME (paid plans); null on Free. */
    rawStorageKey: { type: String, default: null },
    aiSummary: {
      type: new Schema(
        { summary: String, category: String, model: String, generatedAt: Date },
        { _id: false },
      ),
    },
    /** No TTL index: the `retention` job deletes the R2 object first, then the document. */
    expireAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "email_contents" },
);

emailContentSchema.index({ emailId: 1 }, { unique: true });
emailContentSchema.index({ orgId: 1, emailId: 1 });
emailContentSchema.index({ expireAt: 1 });

export type EmailContent = InferSchemaType<typeof emailContentSchema>;
export type EmailContentDoc = HydratedDocument<EmailContent>;

export const EmailContentModel =
  (models.EmailContent as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("EmailContent", emailContentSchema);
}
