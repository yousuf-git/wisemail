import type { ClientSession, Model } from "mongoose";
import type { Types } from "mongoose";

/** Thrown when a referenced document is missing or belongs to another organization. */
export class RefError extends Error {
  readonly code = "invalid_reference";
  constructor(readonly missing: { model: string; id: string }[]) {
    // Same message whether the document is absent or in another org: never confirm existence.
    super(`Referenced ${[...new Set(missing.map((m) => m.model))].join(", ")} not found`);
    this.name = "RefError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RefModel = Model<any>;

export type RefCheck = {
  model: RefModel;
  ids: readonly (Types.ObjectId | null | undefined)[];
};

/**
 * Same-org existence check for references (TRD §2.12): every id must exist in `model`
 * with `orgId` equal to the caller's org. Nullish ids are skipped (optional refs).
 */
export async function assertRefs(
  orgId: Types.ObjectId,
  checks: readonly RefCheck[],
  options: { session?: ClientSession } = {},
): Promise<void> {
  const missing: { model: string; id: string }[] = [];

  await Promise.all(
    checks.map(async ({ model, ids }) => {
      const unique = new Map<string, Types.ObjectId>();
      for (const id of ids) if (id) unique.set(id.toString(), id as Types.ObjectId);
      if (unique.size === 0) return;

      const found = await model
        .find(
          { _id: { $in: [...unique.values()] }, orgId },
          { _id: 1 },
          { session: options.session },
        )
        .lean();
      const foundIds = new Set(found.map((d: { _id: Types.ObjectId }) => d._id.toString()));
      for (const key of unique.keys()) {
        if (!foundIds.has(key)) missing.push({ model: model.modelName, id: key });
      }
    }),
  );

  if (missing.length > 0) throw new RefError(missing);
}
