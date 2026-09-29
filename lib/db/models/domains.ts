import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { mirrorFields } from "./mirror";

export const DOMAIN_STATUSES = [
  "not_started",
  "pending",
  "verified",
  "partially_verified",
  "partially_failed",
  "failed",
  "temporary_failure",
] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

const dnsRecord = new Schema(
  {
    record: { type: String, required: true },
    type: { type: String, required: true },
    name: { type: String, required: true },
    value: { type: String, required: true },
    priority: Number,
    status: { type: String, required: true },
  },
  { _id: false },
);

const domainSchema = new Schema(
  {
    ...mirrorFields,
    /** Set by the projects feature, never by sync. */
    projectId: { type: Schema.Types.ObjectId, ref: "projects", default: null },
    name: { type: String, required: true },
    status: { type: String, enum: DOMAIN_STATUSES, required: true },
    region: { type: String },
    openTracking: { type: Boolean, default: false },
    clickTracking: { type: Boolean, default: false },
    receiving: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: false },
          mxVerified: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: () => ({ enabled: false, mxVerified: false }),
    },
    /** DNS records as Resend reports them; bounded (a handful per domain). */
    records: { type: [dnsRecord], default: [] },
    /** Our own periodic DNS check (Phase 6); never written by sync. */
    dnsCheck: {
      type: new Schema(
        {
          checkedAt: Date,
          spf: String,
          dkim: String,
          dmarc: String,
          mx: String,
          /** Per-record findings of the last check; bounded (a handful of records per domain). */
          details: {
            type: [
              new Schema(
                {
                  group: String,
                  type: String,
                  name: String,
                  expected: String,
                  found: { type: [String], default: [] },
                  verdict: String,
                  message: String,
                },
                { _id: false },
              ),
            ],
            default: [],
          },
        },
        { _id: false },
      ),
    },
    resendCreatedAt: { type: Date },
  },
  { timestamps: true, collection: "domains" },
);

domainSchema.index({ connectionId: 1, resendId: 1 }, { unique: true });
domainSchema.index({ orgId: 1, connectionId: 1 });
domainSchema.index({ orgId: 1, projectId: 1 });
domainSchema.index({ orgId: 1, name: 1 });

export type Domain = InferSchemaType<typeof domainSchema>;
export type DomainDoc = HydratedDocument<Domain>;

export const DomainModel = (models.Domain as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Domain", domainSchema);
}
