import type { FastifyPluginAsync } from "fastify";

import { dispatchOrgAction } from "@/lib/actions/dispatch";
import "@/lib/actions/register-all";

import { toWebRequest } from "../http.js";

/** `POST /api/v1/actions/:id` — org mutations (migrating off Next server actions). */
export const actionRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string } }>("/api/v1/actions/:id", async (request, reply) => {
    const webRequest = toWebRequest(request);
    const { status, body } = await dispatchOrgAction(
      request.params.id,
      request.body,
      webRequest.headers,
    );
    return reply.code(status).header("cache-control", "private, no-store").send(body);
  });
};
