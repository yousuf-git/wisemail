import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

/**
 * Permission model shared by client and server (UCD §1 permission matrix).
 * Resource -> actions. The `organization`, `member`, `invitation` (and unused `team`, `ac`)
 * resources come from Better Auth's defaults so the plugin's own endpoints keep working.
 */
export const statement = {
  ...defaultStatements,
  billing: ["read", "manage"],
  usage: ["read"],
  settings: ["read", "update"],
  auditLog: ["read"],
  connection: ["read", "create", "update", "delete"],
  project: ["read", "create", "update", "delete"],
  sender: ["read", "create", "update", "delete"],
  domain: ["read", "create", "update", "verify", "delete"],
  // `createSending` = keys limited to the "sending access" scope (Developer).
  apiKey: ["read", "create", "createSending", "delete"],
  email: ["read", "send", "trash", "delete"],
  thread: ["read", "assign", "label", "trash"],
  activity: ["read"],
  insights: ["read"],
  contact: ["read", "create", "update", "import", "unsubscribe", "delete"],
  audience: ["read", "manage"], // segments, topics, properties
  broadcast: ["read", "create", "send"],
  template: ["read", "create", "update", "delete"],
  automation: ["read", "toggle"],
  alertRule: ["read", "create", "update", "delete"],
  ai: ["use", "configure"],
  cleanupRule: ["manage", "manageDelete"],
} as const;

export const ac = createAccessControl(statement);

export const ROLES = ["owner", "admin", "developer", "support", "viewer"] as const;
export type Role = (typeof ROLES)[number];

// Owner: everything, including billing and deleting the organization.
const owner = ac.newRole({ ...statement });

// Admin: everything except billing and deleting the organization.
const admin = ac.newRole({ ...statement, organization: ["update"], billing: [] });

// Developer: operational access; sends; no connections, members or settings.
const developer = ac.newRole({
  connection: ["read"],
  sender: ["read", "create", "update", "delete"],
  domain: ["read", "update"], // update = tracking toggles
  apiKey: ["read", "createSending"],
  email: ["read", "send", "trash"],
  thread: ["read", "assign", "label", "trash"],
  activity: ["read"],
  insights: ["read"],
  contact: ["read", "create", "update", "import", "unsubscribe", "delete"],
  audience: ["read", "manage"],
  broadcast: ["read", "create", "send"],
  template: ["read", "create", "update", "delete"],
  automation: ["read", "toggle"],
  alertRule: ["read", "create", "update", "delete"],
  ai: ["use"],
  cleanupRule: ["manage"], // archive/trash rules, not the delete action
});

// Support: inbox-focused.
const support = ac.newRole({
  connection: ["read"],
  sender: ["read"],
  email: ["read", "send", "trash"],
  thread: ["read", "assign", "label", "trash"],
  activity: ["read"],
  contact: ["read", "unsubscribe"],
  ai: ["use"],
});

// Viewer: read-only.
const viewer = ac.newRole({
  connection: ["read"],
  domain: ["read"],
  email: ["read"],
  thread: ["read"],
  activity: ["read"],
  insights: ["read"],
  template: ["read"],
  automation: ["read"],
});

export const roles = { owner, admin, developer, support, viewer } as const;

type Statement = typeof statement;
export type Resource = keyof Statement;
export type Permission = {
  [R in Resource]: `${R}:${Statement[R][number]}`;
}[Resource];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Pure check used by the DAL and the UI. `role` is `member.role`, possibly comma-separated.
 * Unknown roles grant nothing.
 */
export function roleHasPermission(role: string, permission: Permission): boolean {
  const [resource, action] = permission.split(":") as [Resource, string];
  return role.split(",").some((r) => {
    const def = isRole(r.trim()) ? roles[r.trim() as Role] : undefined;
    return def?.authorize({ [resource]: [action] } as never).success === true;
  });
}
