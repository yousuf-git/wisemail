
import { orgAction } from "@/lib/actions/org-action";
import type { ActionResult } from "@/lib/actions/result";
import { recordTourEvent, tourEventInput, type TourEventInput } from "@/lib/tours/progress";

/** Saves tour progress for the signed-in member (start, step, complete, skip). Any member may. */
const record = orgAction({ id: "tour.record", input: tourEventInput }, ({ ctx, input }) =>
  recordTourEvent(ctx, input),
);

export async function recordTourEventAction(
  orgSlug: string,
  input: TourEventInput,
): Promise<ActionResult<{ tourId: string; event: string }>> {
  return record(orgSlug, input);
}
