import "server-only";

import { Types } from "mongoose";
import { z } from "zod";

import type { OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { TourProgressModel } from "@/lib/db/models/tour-progress";
import { ServiceError } from "@/lib/services/errors";
import { getTour, toStateDTO, tourAvailable, TOURS, type TourBootstrapDTO } from "./index";

/**
 * Product tour progress (TRD §2.11, DBD `tour_progress`): one document per user, org and tour,
 * written by `onStart`, `onStepChange`, `onComplete` and `onSkip` through a server action, so it
 * follows the member across devices. A tour that was started, completed or skipped never starts
 * on its own again until its major version goes up.
 */

export const tourEventInput = z.object({
  tourId: z.string().min(1).max(60),
  event: z.enum(["start", "step", "complete", "skip"]),
  step: z.number().int().min(0).max(100).optional(),
  trigger: z.enum(["auto", "manual"]).optional(),
});
export type TourEventInput = z.input<typeof tourEventInput>;

export async function recordTourEvent(ctx: OrgContext, raw: TourEventInput) {
  const input = tourEventInput.parse(raw);
  const def = getTour(input.tourId);
  if (!def) throw new ServiceError("not_found", "Unknown tour.");
  await connectDb();
  const key = {
    orgId: new Types.ObjectId(ctx.org.id),
    userId: new Types.ObjectId(ctx.user.id),
    tourId: def.id,
  };
  const now = new Date();
  const step = input.step ?? 0;

  if (input.event === "start") {
    // Replaying keeps `completedAt`, so the Help menu still shows the check.
    await TourProgressModel.updateOne(
      key,
      {
        $set: {
          version: def.version,
          status: "started",
          lastStep: 0,
          startedAt: now,
          skippedAt: null,
          trigger: input.trigger ?? "auto",
        },
        $setOnInsert: { completedAt: null },
      },
      { upsert: true },
    );
  } else if (input.event === "step") {
    await TourProgressModel.updateOne(
      { ...key, status: "started" },
      { $set: { lastStep: step, version: def.version } },
    );
  } else if (input.event === "complete") {
    await TourProgressModel.updateOne(
      key,
      {
        $set: { version: def.version, status: "completed", lastStep: step, completedAt: now },
        $setOnInsert: { startedAt: now, trigger: input.trigger ?? "auto", skippedAt: null },
      },
      { upsert: true },
    );
  } else {
    await TourProgressModel.updateOne(
      key,
      {
        $set: { version: def.version, status: "skipped", lastStep: step, skippedAt: now },
        $setOnInsert: { startedAt: now, trigger: input.trigger ?? "auto", completedAt: null },
      },
      { upsert: true },
    );
  }
  return { tourId: def.id, event: input.event };
}

/** The member's progress and the steps that apply to them, for the tour provider and Help menu. */
export async function getTourBootstrap(ctx: OrgContext): Promise<TourBootstrapDTO> {
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  const [rows, connections] = await Promise.all([
    TourProgressModel.find({ orgId, userId: new Types.ObjectId(ctx.user.id) }).lean(),
    ConnectionModel.countDocuments({ orgId, deletedAt: null }),
  ]);
  const byTour = new Map(rows.map((r) => [r.tourId, r]));
  return {
    tours: TOURS.filter((def) => tourAvailable(def, ctx.can)).map((def) =>
      toStateDTO(def, ctx.can, byTour.get(def.id)),
    ),
    hasConnection: connections > 0,
  };
}

/** Removes a member's tour progress (they left the organization; DBD §5). */
export async function deleteTourProgress(orgId: Types.ObjectId, userId: Types.ObjectId) {
  await connectDb();
  await TourProgressModel.deleteMany({ orgId, userId });
}
