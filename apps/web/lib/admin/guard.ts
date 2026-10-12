import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";

import { getSession } from "@/lib/dal";
import { hasAdminRole } from "./allowlist";

/**
 * Platform admin guard. A platform admin is a Better Auth user with role "admin" (the `admin`
 * plugin); `PLATFORM_ADMIN_EMAILS` only bootstraps that role at sign-in (lib/admin/plugin.ts).
 *
 * Every admin page, layout and action calls this on the server. Anyone else (visitors, members,
 * impersonated sessions, banned users) gets a plain 404 so the panel's existence is not revealed.
 */
export type AdminActor = { id: string; name: string; email: string };

/** The signed-in platform admin, or null. Never redirects, never throws. Cached per request. */
export const getPlatformAdmin = cache(async (): Promise<AdminActor | null> => {
  const session = await getSession();
  if (!session) return null;
  // An impersonation session belongs to the impersonated user, never to an admin.
  if ((session.session as { impersonatedBy?: string | null }).impersonatedBy) return null;
  const user = session.user as typeof session.user & { role?: string | null; banned?: boolean };
  if (user.banned || !hasAdminRole(user.role)) return null;
  return { id: user.id, name: user.name, email: user.email };
});

/** For pages, layouts and route handlers: 404 unless the caller is a platform admin. */
export async function requirePlatformAdmin(): Promise<AdminActor> {
  const admin = await getPlatformAdmin();
  if (!admin) notFound();
  return admin;
}
