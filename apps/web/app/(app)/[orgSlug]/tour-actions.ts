"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import { recordTourEvent, tourEventInput, type TourEventInput } from "@/lib/tours/progress";

/** Saves tour progress for the signed-in member (start, step, complete, skip). Any member may. */
const record = orgAction({ input: tourEventInput }, ({ ctx, input }) =>
  recordTourEvent(ctx, input),
);

export async function recordTourEventAction(
  orgSlug: string,
  input: TourEventInput,
): Promise<ActionResult<{ tourId: string; event: string }>> {
  return record(orgSlug, input);
}
