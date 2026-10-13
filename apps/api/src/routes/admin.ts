import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { getPlatformAdminFromHeaders } from "@/lib/admin/guard";
import { getAdminCatalog } from "@/lib/services/admin/catalog";
import { getSystemHealth } from "@/lib/services/admin/health";
import { getOrgDetail, listOrgs } from "@/lib/services/admin/orgs";
import { getOverview } from "@/lib/services/admin/overview";
import { getUserDetail, listUsers } from "@/lib/services/admin/users";

import { toWebRequest } from "../http.js";

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const web = toWebRequest(req);
  const admin = await getPlatformAdminFromHeaders(web.headers);
  if (!admin) {
    await reply.code(404).header("cache-control", "private, no-store").send({ error: "not_found" });
    return null;
  }
  return admin;
}

function q(req: FastifyRequest, key: string) {
  const v = (req.query as Record<string, string | undefined>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Platform admin read APIs (404 for non-admins). Mutations stay on
 * `POST /api/v1/admin-actions/:id`.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/admin/me", async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    return reply.header("cache-control", "private, no-store").send(admin);
  });

  app.get("/api/v1/admin/overview", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return reply.header("cache-control", "private, no-store").send(await getOverview());
  });

  app.get("/api/v1/admin/users", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const page = await listUsers({ q: q(req, "q"), cursor: q(req, "cursor") });
    return reply.header("cache-control", "private, no-store").send(page);
  });

  app.get<{ Params: { userId: string } }>("/api/v1/admin/users/:userId", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const user = await getUserDetail(req.params.userId);
    if (!user) {
      return reply.code(404).header("cache-control", "private, no-store").send({ error: "not_found" });
    }
    return reply.header("cache-control", "private, no-store").send(user);
  });

  app.get("/api/v1/admin/organizations", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const page = await listOrgs({ q: q(req, "q"), cursor: q(req, "cursor") });
    return reply.header("cache-control", "private, no-store").send(page);
  });

  app.get<{ Params: { orgId: string } }>(
    "/api/v1/admin/organizations/:orgId",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const org = await getOrgDetail(req.params.orgId);
      if (!org) {
        return reply
          .code(404)
          .header("cache-control", "private, no-store")
          .send({ error: "not_found" });
      }
      return reply.header("cache-control", "private, no-store").send(org);
    },
  );

  app.get("/api/v1/admin/health", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return reply.header("cache-control", "private, no-store").send(await getSystemHealth());
  });

  app.get("/api/v1/admin/catalog", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return reply.header("cache-control", "private, no-store").send(await getAdminCatalog());
  });
};
