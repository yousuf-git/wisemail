"use server";

import { redirect } from "next/navigation";

import { getSession } from "@/lib/dal";
import { endImpersonation } from "@/lib/services/admin/users";

/**
 * Ends the current impersonation session and returns to the admin's own. Not behind the admin
 * guard on purpose: while impersonating, the session belongs to the impersonated user. It only
 * works when the session really carries `impersonatedBy`.
 */
export async function stopImpersonationAction() {
  const session = await getSession();
  const adminId = (session?.session as { impersonatedBy?: string | null } | undefined)
    ?.impersonatedBy;
  if (!session || !adminId) redirect("/");
  await endImpersonation({ adminId, targetUserId: session.user.id });
  redirect(`/admin/users/${session.user.id}`);
}
