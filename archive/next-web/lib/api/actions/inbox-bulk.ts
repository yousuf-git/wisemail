/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const countMatchingAction = org("inbox.bulk.count");
export const countTrashAction = org("inbox.bulk.trashCount");
export const emptyTrashAction = org("inbox.bulk.empty");
export const getBulkOperationAction = org("inbox.bulk.progress");
export const permanentlyDeleteAction = org("inbox.bulk.del");
export const startBulkAction = org("inbox.bulk.start");
