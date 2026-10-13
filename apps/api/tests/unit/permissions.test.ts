import { describe, expect, it } from "vitest";

import { ROLES, roleHasPermission, type Permission, type Role } from "@/lib/auth/permissions";

const can = (role: string, p: Permission) => roleHasPermission(role, p);

describe("permission matrix (UCD §1)", () => {
  it("owner can do everything, including billing and org deletion", () => {
    expect(can("owner", "connection:create")).toBe(true);
    expect(can("owner", "billing:manage")).toBe(true);
    expect(can("owner", "organization:delete")).toBe(true);
    expect(can("owner", "email:delete")).toBe(true);
  });

  it("admin has no billing and cannot delete the org", () => {
    expect(can("admin", "connection:create")).toBe(true);
    expect(can("admin", "member:update")).toBe(true);
    expect(can("admin", "billing:read")).toBe(false);
    expect(can("admin", "billing:manage")).toBe(false);
    expect(can("admin", "organization:delete")).toBe(false);
  });

  it("developer sends and manages keys/domains tracking but not connections or members", () => {
    expect(can("developer", "email:send")).toBe(true);
    expect(can("developer", "broadcast:send")).toBe(true);
    expect(can("developer", "apiKey:createSending")).toBe(true);
    expect(can("developer", "apiKey:create")).toBe(false);
    expect(can("developer", "apiKey:delete")).toBe(false);
    expect(can("developer", "domain:update")).toBe(true);
    expect(can("developer", "domain:delete")).toBe(false);
    expect(can("developer", "connection:create")).toBe(false);
    expect(can("developer", "member:create")).toBe(false);
    expect(can("developer", "cleanupRule:manage")).toBe(true);
    expect(can("developer", "cleanupRule:manageDelete")).toBe(false);
    expect(can("developer", "email:delete")).toBe(false);
  });

  it("support is inbox-focused", () => {
    expect(can("support", "email:send")).toBe(true);
    expect(can("support", "thread:assign")).toBe(true);
    expect(can("support", "contact:unsubscribe")).toBe(true);
    expect(can("support", "contact:update")).toBe(false);
    expect(can("support", "domain:read")).toBe(false);
    expect(can("support", "broadcast:create")).toBe(false);
    expect(can("support", "settings:read")).toBe(false);
  });

  it("viewer is read-only", () => {
    expect(can("viewer", "connection:create")).toBe(false);
    expect(can("viewer", "email:send")).toBe(false);
    expect(can("viewer", "broadcast:send")).toBe(false);
    expect(can("viewer", "apiKey:create")).toBe(false);
    expect(can("viewer", "thread:read")).toBe(true);
    expect(can("viewer", "insights:read")).toBe(true);
    expect(can("viewer", "template:read")).toBe(true);
    expect(can("viewer", "thread:trash")).toBe(false);
  });

  it("unknown roles grant nothing; comma-separated roles union", () => {
    expect(can("hacker", "thread:read")).toBe(false);
    expect(can("", "thread:read")).toBe(false);
    expect(can("viewer,developer", "email:send")).toBe(true);
  });

  it("every role is defined", () => {
    for (const role of ROLES as readonly Role[])
      expect(can(role, "activity:read")).toBe(role !== undefined);
  });
});
