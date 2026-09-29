import type { HydratedDocument, InferSchemaType } from "mongoose";
import { Schema, model, models } from "mongoose";

import { PROJECT_COLORS } from "@/lib/validation/project";

const projectSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "organization", required: true, immutable: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    color: { type: String, enum: PROJECT_COLORS, required: true, default: "accent" },
    description: { type: String, trim: true, default: "" },
    deletedAt: { type: Date, default: null },
  },
  // User-edited document: optimistic concurrency via the version key (DBD rule 11).
  { timestamps: true, collection: "projects", optimisticConcurrency: true },
);

// Uniqueness only among live projects, so a deleted project frees its name and slug.
const live = { deletedAt: { $type: "null" } } as const;
projectSchema.index({ orgId: 1, name: 1 }, { unique: true, partialFilterExpression: live });
projectSchema.index({ orgId: 1, slug: 1 }, { unique: true, partialFilterExpression: live });

export type Project = InferSchemaType<typeof projectSchema>;
export type ProjectDoc = HydratedDocument<Project>;

export const ProjectModel = (models.Project as ReturnType<typeof build> | undefined) ?? build();

function build() {
  return model("Project", projectSchema);
}
