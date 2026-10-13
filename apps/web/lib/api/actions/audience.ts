/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const appendImportRowsAction = org("audience.appendRows");
export const createContactAction = org("audience.create");
export const createContactImportAction = org("audience.startUpload");
export const createPropertyAction = org("audience.propCreate");
export const createSegmentAction = org("audience.segCreate");
export const createTopicAction = org("audience.topCreate");
export const deleteContactAction = org("audience.removeContact");
export const deletePropertyAction = org("audience.propDelete");
export const deleteSegmentAction = org("audience.segDelete");
export const deleteTopicAction = org("audience.topDelete");
export const getContactImportAction = org("audience.status");
export const importContactsBatchAction = org("audience.batch");
export const importFinishedAction = org("audience.finished");
export const renameSegmentAction = org("audience.segRename");
export const setContactSegmentsAction = org("audience.segmentsOf");
export const setContactTopicsAction = org("audience.topicsOf");
export const startContactImportAction = org("audience.start");
export const updateContactAction = org("audience.update");
export const updatePropertyAction = org("audience.propUpdate");
export const updateTopicAction = org("audience.topUpdate");
