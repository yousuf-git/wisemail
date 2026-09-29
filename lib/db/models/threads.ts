import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

const threadSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    connectionId: {
      type: Schema.Types.ObjectId,
      ref: "connections",
      required: true,
      immutable: true,
    },
    /** Receiving domain. */
    domainId: { type: Schema.Types.ObjectId, ref: "domains", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "projects", default: null },
    /** Our address the conversation is with. */
    mailboxAddress: { type: String, default: "" },
    /** Normalized: no `Re:` / `Fwd:`. */
    subject: { type: String, default: "" },
    /** Lowercased normalized subject, for the threading fallback. */
    subjectKey: { type: String, default: "" },
    /** External addresses, lowercased. */
    participants: { type: [String], default: [] },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, required: true },
    lastInboundAt: { type: Date },
    lastOutboundAt: { type: Date },
    snippet: { type: String, default: "" },
    hasAttachments: { type: Boolean, default: false },
    assigneeId: { type: Schema.Types.ObjectId, ref: "user", default: null },
    labelIds: { type: [Schema.Types.ObjectId], ref: "labels", default: [] },
    starred: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    aiCategory: { type: String },
    /** Triage of the newest inbound message (Phase 7); the row chip and the inbox filter read it. */
    aiTriage: {
      type: new Schema(
        {
          emailId: { type: Schema.Types.ObjectId },
          category: String,
          priority: String,
          sentiment: String,
          summary: String,
          model: String,
          generatedAt: Date,
        },
        { _id: false },
      ),
    },
    trashedAt: { type: Date, default: null },
    trashedBy: { type: Schema.Types.ObjectId, ref: "user", default: null },
    purgeAt: { type: Date, default: null },
    trashedByOpId: { type: Schema.Types.ObjectId, default: null },
    expireAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "threads" },
);

threadSchema.index({ orgId: 1, archived: 1, lastMessageAt: -1 });
threadSchema.index({ orgId: 1, assigneeId: 1, lastMessageAt: -1 });
threadSchema.index({ orgId: 1, aiCategory: 1, lastMessageAt: -1 });
threadSchema.index({ orgId: 1, projectId: 1, lastMessageAt: -1 });
threadSchema.index({ orgId: 1, participants: 1, lastMessageAt: -1 });
// Threading fallback: same normalized subject within a window.
threadSchema.index({ orgId: 1, subjectKey: 1, lastMessageAt: -1 });
threadSchema.index(
  { orgId: 1, trashedAt: -1 },
  { partialFilterExpression: { trashedAt: { $type: "date" } } },
);
threadSchema.index({ purgeAt: 1 }, { partialFilterExpression: { purgeAt: { $type: "date" } } });
threadSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type Thread = InferSchemaType<typeof threadSchema>;
export type ThreadDoc = HydratedDocument<Thread>;

export const ThreadModel = (models.Thread as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Thread", threadSchema);
}
