import { roleHasPermission, type Permission, type Role } from "@/lib/auth/permissions";
import type { OrgAccess, OrgRef } from "@/lib/services/tenancy";

/** Shared org/session DTOs — no Next.js imports (safe for Fastify). */

export type UserDTO = { id: string; name: string; email: string; image: string | null };

export type OrgContext = {
  user: UserDTO;
  org: OrgRef;
  role: Role;
  orgs: OrgRef[];
  memberId: string;
  projectScope: string[] | null;
  can: (permission: Permission) => boolean;
};

export class ForbiddenError extends Error {
  readonly code = "forbidden";
  constructor(readonly permission: Permission) {
    super("You don't have permission to do that.");
    this.name = "ForbiddenError";
  }
}

export function buildOrgContext(
  user: UserDTO,
  access: OrgAccess,
  orgs: OrgRef[],
  projectScope: string[] | null = null,
): OrgContext {
  return {
    user,
    org: access.org,
    role: access.role,
    orgs,
    memberId: access.memberId,
    projectScope,
    can: (permission) => roleHasPermission(access.role, permission),
  };
}

export type OrgContextResult =
  | { status: "ok"; ctx: OrgContext }
  | { status: "unauthenticated" }
  | { status: "not_member" }
  | { status: "suspended"; org: OrgRef; reason: string };
