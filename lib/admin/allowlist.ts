/**
 * Platform admin bootstrap. `PLATFORM_ADMIN_EMAILS` (comma-separated) names the people who become
 * platform admins (Better Auth user role "admin") the next time they sign in with a verified
 * address. Pure helpers, safe to import anywhere; the role itself lives on the `user` document.
 */
export const ADMIN_ROLE = "admin";

export function parseAllowlist(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowlisted(email: string, raw: string | undefined | null): boolean {
  return parseAllowlist(raw).includes(email.trim().toLowerCase());
}

/** Better Auth stores several roles as a comma-separated string. */
export function hasAdminRole(role: string | null | undefined): boolean {
  return (role ?? "")
    .split(",")
    .map((r) => r.trim())
    .includes(ADMIN_ROLE);
}
