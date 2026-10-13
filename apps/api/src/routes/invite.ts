import type { FastifyPluginAsync } from "fastify";

import { getSessionFromHeaders } from "@/lib/dal-request";
import { getInvitePreview } from "@/lib/services/members";

import { toWebRequest } from "../http.js";

/**
 * Public invite preview for the SPA (`/invite/:token`). Never returns the raw invite email —
 * only a masked address. When a session is present, includes `emailMatches` / `emailVerified`.
 */
export const inviteRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/invite/preview", async (req, reply) => {
    const token = (req.query as { token?: string }).token?.trim();
    if (!token) {
      return reply.code(400).send({ error: "validation", message: "token is required" });
    }

    const preview = await getInvitePreview(token);
    if (preview.status === "invalid") {
      return reply.header("cache-control", "private, no-store").send({ status: "invalid" });
    }
    if (preview.status === "expired" || preview.status === "used") {
      return reply
        .header("cache-control", "private, no-store")
        .send({ status: preview.status, orgName: preview.orgName });
    }

    const web = toWebRequest(req);
    const session = await getSessionFromHeaders(web.headers);
    const body: Record<string, unknown> = {
      status: "pending",
      orgName: preview.orgName,
      role: preview.role,
      maskedEmail: preview.maskedEmail,
    };
    if (session?.user) {
      body.emailMatches =
        session.user.email.toLowerCase() === preview.email.toLowerCase();
      body.emailVerified = Boolean(
        (session.user as { emailVerified?: boolean }).emailVerified,
      );
      body.signedInEmail = session.user.email;
    }
    return reply.header("cache-control", "private, no-store").send(body);
  });
};
