"use server";

import { orgAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import type { DnsCheckDTO, DomainDTO } from "@/lib/dto/domain";
import { checkDnsNow } from "@/lib/services/dns-check";
import {
  assignDomainProject,
  createDomain,
  deleteDomain,
  setDomainTracking,
  verifyDomain,
  type DeleteDomainResult,
} from "@/lib/services/domains";
import {
  assignDomainProjectSchema,
  checkDnsSchema,
  createDomainSchema,
  deleteDomainSchema,
  domainIdSchema,
  setDomainTrackingSchema,
  type CreateDomainFormInput,
} from "@/lib/validation/domain";

const tracking = orgAction(
  { input: setDomainTrackingSchema, permission: "domain:update" },
  ({ ctx, input }) => setDomainTracking(ctx, input),
);
const assign = orgAction(
  { input: assignDomainProjectSchema, permission: "project:update" },
  ({ ctx, input }) => assignDomainProject(ctx, input),
);
const verify = orgAction({ input: domainIdSchema, permission: "domain:verify" }, ({ ctx, input }) =>
  verifyDomain(ctx, input),
);
const check = orgAction({ input: checkDnsSchema, permission: "domain:update" }, ({ ctx, input }) =>
  checkDnsNow(ctx, input),
);
const create = orgAction(
  { input: createDomainSchema, permission: "domain:create" },
  ({ ctx, input }) => createDomain(ctx, input),
);
const remove = orgAction(
  { input: deleteDomainSchema, permission: "domain:delete" },
  ({ ctx, input }) => deleteDomain(ctx, input),
);

export async function setDomainTrackingAction(
  orgSlug: string,
  input: { domainId: string; openTracking?: boolean; clickTracking?: boolean },
): Promise<ActionResult<DomainDTO>> {
  return tracking(orgSlug, input);
}

export async function assignDomainProjectAction(
  orgSlug: string,
  input: { domainId: string; projectId: string | null },
): Promise<ActionResult<DomainDTO>> {
  return assign(orgSlug, input);
}

export async function verifyDomainAction(
  orgSlug: string,
  input: { domainId: string },
): Promise<ActionResult<DomainDTO>> {
  return verify(orgSlug, input);
}

export async function checkDnsAction(
  orgSlug: string,
  input: { domainId: string },
): Promise<ActionResult<DnsCheckDTO>> {
  return check(orgSlug, input);
}

export async function createDomainAction(
  orgSlug: string,
  input: CreateDomainFormInput,
): Promise<ActionResult<DomainDTO>> {
  return create(orgSlug, input);
}

export async function deleteDomainAction(
  orgSlug: string,
  input: { domainId: string; confirmName: string },
): Promise<ActionResult<DeleteDomainResult>> {
  return remove(orgSlug, input);
}
