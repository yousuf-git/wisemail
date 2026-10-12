import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

/** Per-member read state. Unread = `threads.lastInboundAt > lastReadAt` (or no state at all). */
const threadMemberStateSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    threadId: { type: Schema.Types.ObjectId, ref: "threads", required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: "user", required: true, immutable: true },
    lastReadAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "thread_member_states" },
);

threadMemberStateSchema.index({ threadId: 1, userId: 1 }, { unique: true });
threadMemberStateSchema.index({ orgId: 1, userId: 1 });

export type ThreadMemberState = InferSchemaType<typeof threadMemberStateSchema>;
export type ThreadMemberStateDoc = HydratedDocument<ThreadMemberState>;

export const ThreadMemberStateModel =
  (models.ThreadMemberState as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("ThreadMemberState", threadMemberStateSchema);
}
