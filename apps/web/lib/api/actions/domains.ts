/** HTTP action clients — import from this file, not a barrel. */
import { org } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const assignDomainProjectAction = org("domains.assign");
export const checkDnsAction = org("domains.check");
export const createDomainAction = org("domains.create");
export const deleteDomainAction = org("domains.remove");
export const setDomainTrackingAction = org("domains.tracking");
export const verifyDomainAction = org("domains.verify");
