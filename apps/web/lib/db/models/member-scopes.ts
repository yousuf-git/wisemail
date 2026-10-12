import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

/**
 * Present only for project-restricted members (DBD §4.1). A member without a document sees the
 * whole organization; a document is never left with an empty `projectIds`.
 */
const memberScopeSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    memberId: { type: Schema.Types.ObjectId, ref: "member", required: true, immutable: true },
    projectIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "projects" }],
      required: true,
      validate: { validator: (v: unknown[]) => v.length > 0, message: "projectIds is empty" },
    },
  },
  { timestamps: true, collection: "member_scopes" },
);

memberScopeSchema.index({ orgId: 1, memberId: 1 }, { unique: true });
memberScopeSchema.index({ orgId: 1, projectIds: 1 });

export type MemberScope = InferSchemaType<typeof memberScopeSchema>;
export type MemberScopeDoc = HydratedDocument<MemberScope>;

export const MemberScopeModel =
  (models.MemberScope as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("MemberScope", memberScopeSchema);
}
