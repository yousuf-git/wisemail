import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { AI_FEATURES } from "@wisemail/shared/ai";

/** Singleton key for the one platform_settings row. */
export const PLATFORM_SETTINGS_KEY = "default";

const creditCostSchema = new Schema(
  Object.fromEntries(AI_FEATURES.map((f) => [f, { type: Number, required: true }])),
  { _id: false },
);

const platformSettingsSchema = new Schema(
  {
    key: { type: String, required: true, default: PLATFORM_SETTINGS_KEY, immutable: true },
    trialDays: { type: Number, required: true },
    trialAiCredits: { type: Number, required: true },
    freeGraceDays: { type: Number, required: true },
    freeOverAllowanceRetentionDays: { type: Number, required: true },
    retentionNoticeDays: { type: Number, required: true },
    paymentGraceDays: { type: Number, required: true },
    usageThresholds: { type: [Number], required: true },
    creditPack: {
      type: new Schema(
        {
          credits: { type: Number, required: true },
          priceUsd: { type: Number, required: true },
          maxPacks: { type: Number, required: true },
          stripePriceId: { type: String, default: null },
        },
        { _id: false },
      ),
      required: true,
    },
    aiCreditCost: { type: creditCostSchema, required: true },
    aiModel: { type: String, default: null },
    aiModelFast: { type: String, default: null },
    aiBaseUrl: { type: String, default: null },
    systemFromEmail: { type: String, default: null },
    billingEnabled: { type: Boolean, required: true, default: false },
    googleSignIn: { type: Boolean, required: true, default: false },
    githubSignIn: { type: Boolean, required: true, default: false },
    aiEnabled: { type: Boolean, required: true, default: true },
    stripePriceIds: { type: Map, of: String, default: () => new Map() },
    revision: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: "platform_settings" },
);

platformSettingsSchema.index({ key: 1 }, { unique: true });

export type PlatformSettings = InferSchemaType<typeof platformSettingsSchema>;
export type PlatformSettingsDoc = HydratedDocument<PlatformSettings>;

export const PlatformSettingsModel =
  (models.PlatformSettings as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("PlatformSettings", platformSettingsSchema);
}
