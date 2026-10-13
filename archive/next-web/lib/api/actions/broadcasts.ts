/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const cancelBroadcastAction = org("broadcasts.cancel");
export const createBroadcastAction = org("broadcasts.create");
export const deleteBroadcastAction = org("broadcasts.remove");
export const getBroadcastAudienceAction = org("broadcasts.audience");
export const refreshBroadcastAction = org("broadcasts.refresh");
export const sendBroadcastAction = org("broadcasts.send");
export const sendBroadcastTestAction = org("broadcasts.test");
export const updateBroadcastAction = org("broadcasts.update");
