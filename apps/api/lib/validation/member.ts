import { z } from "zod";

import { ROLES } from "@/lib/auth/permissions";

const idSchema = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id.");
const roleSchema = z.enum(ROLES, { error: "Pick a role." });

export const inviteMemberSchema = z.object({
  email: z.email("That email doesn't look right.").transform((e) => e.trim().toLowerCase()),
  role: roleSchema,
  projectIds: z.array(idSchema).max(200).default([]),
});
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;

export const changeMemberRoleSchema = z.object({ memberId: idSchema, role: roleSchema });
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;

export const removeMemberSchema = z.object({ memberId: idSchema });
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;

export const cancelInvitationSchema = z.object({ invitationId: idSchema });
export type CancelInvitationInput = z.infer<typeof cancelInvitationSchema>;

/** The random token from the `/invite/<token>` link (not an invitation id). */
export const acceptInvitationSchema = z.object({ token: z.string().min(1).max(200) });
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  support: "Support",
  viewer: "Viewer",
};

export const ROLE_BLURBS: Record<(typeof ROLES)[number], string> = {
  owner: "Everything, including billing.",
  admin: "Manages members, projects and connections.",
  developer: "Sends email, manages senders and audience.",
  support: "Works the inbox.",
  viewer: "Read-only.",
};
