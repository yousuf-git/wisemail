import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { mirrorFields } from "./mirror";

export const API_KEY_PERMISSIONS = ["full_access", "sending_access"] as const;

/** Metadata only; the key itself is never stored (DBD §4.2). */
const apiKeySchema = new Schema(
  {
    ...mirrorFields,
    name: { type: String, required: true },
    /** Not returned by Resend's list endpoint, so unknown (unset) until a key is created here. */
    permission: { type: String, enum: API_KEY_PERMISSIONS },
    domainId: { type: Schema.Types.ObjectId, ref: "domains", default: null },
    resendCreatedAt: { type: Date },
    lastUsedAt: { type: Date, default: null },
    createdViaApp: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "user", default: null },
  },
  { timestamps: true, collection: "api_keys" },
);

apiKeySchema.index({ connectionId: 1, resendId: 1 }, { unique: true });
apiKeySchema.index({ orgId: 1, connectionId: 1 });

export type ApiKey = InferSchemaType<typeof apiKeySchema>;
export type ApiKeyDoc = HydratedDocument<ApiKey>;

export const ApiKeyModel = (models.ApiKey as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("ApiKey", apiKeySchema);
}
