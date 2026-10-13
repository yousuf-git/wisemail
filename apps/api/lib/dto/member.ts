import type { Role } from "@/lib/auth/permissions";

export type MemberDTO = {
  /** Better Auth `member` id. */
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  joinedAt: string;
  /** Projects the member is limited to; `null` = whole workspace. */
  projectIds: string[] | null;
  isYou: boolean;
};

export type InvitationDTO = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  /** Whole days left, at least 1 (computed on the server). */
  expiresInDays: number;
  /**
   * Absolute single-use link, present only right after it was minted (invite or resend): links
   * are random tokens whose hash is all we keep, so a listing cannot show them again.
   */
  link: string | null;
  /** Whether the invitation email went out; `null` when this DTO isn't from a send. */
  emailSent: boolean | null;
  projectIds: string[];
};

export type MemberQuota = {
  /** Members plus pending invitations. */
  used: number;
  /** `null` = unlimited. */
  limit: number | null;
  planLabel: string;
  nextTierLabel: string | null;
  scopesAllowed: boolean;
};

export type InvitePreview =
  | { status: "invalid" }
  | { status: "expired"; orgName: string }
  | { status: "used"; orgName: string }
  | { status: "pending"; orgName: string; role: Role; maskedEmail: string; email: string };
