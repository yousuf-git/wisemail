import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

export const CONTACT_IMPORT_STATUSES = ["queued", "running", "completed", "failed"] as const;
export type ContactImportStatus = (typeof CONTACT_IMPORT_STATUSES)[number];

/** Rows kept per import; the count keeps going past it. */
export const IMPORT_ERROR_CAP = 500;

const rowSchema = new Schema(
  {
    row: { type: Number, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false, minimize: false },
);

const errorSchema = new Schema({ row: Number, email: String, message: String }, { _id: false });

/**
 * A large CSV import (PRD §5.9): the browser validates and uploads the rows, then the throttled
 * `import-contacts` job feeds them to Resend a batch at a time. Documents expire after a week.
 */
const contactImportSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    connectionId: {
      type: Schema.Types.ObjectId,
      ref: "connections",
      required: true,
      immutable: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "user", required: true },
    segmentIds: { type: [Schema.Types.ObjectId], ref: "segments", default: [] },
    updateExisting: { type: Boolean, default: false },
    status: { type: String, enum: CONTACT_IMPORT_STATUSES, default: "queued" },
    total: { type: Number, required: true },
    rows: { type: [rowSchema], default: [] },
    /** Rows handled so far (an index into `rows`). */
    cursor: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    rowErrors: { type: [errorSchema], default: [] },
    failure: { type: String },
    expireAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "contact_imports" },
);

contactImportSchema.index({ orgId: 1, createdAt: -1 });
contactImportSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type ContactImport = InferSchemaType<typeof contactImportSchema>;
export type ContactImportDoc = HydratedDocument<ContactImport>;

export const ContactImportModel =
  (models.ContactImport as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("ContactImport", contactImportSchema);
}
