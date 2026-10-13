import type { FastifyPluginAsync } from "fastify";

import {
  dispatchAdminAction,
  dispatchOrgAction,
  dispatchUserAction,
} from "@/lib/actions/dispatch";
import "@/lib/actions/register-all";

import { toWebRequest } from "../http.js";

/** Org / user / admin mutations over HTTP (migrating off Next server actions). */
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

  app.post<{ Params: { id: string } }>("/api/v1/user-actions/:id", async (request, reply) => {
    const webRequest = toWebRequest(request);
    const { status, body } = await dispatchUserAction(
      request.params.id,
      request.body,
      webRequest.headers,
    );
    return reply.code(status).header("cache-control", "private, no-store").send(body);
  });

  app.post<{ Params: { id: string } }>("/api/v1/admin-actions/:id", async (request, reply) => {
    const webRequest = toWebRequest(request);
    const { status, body } = await dispatchAdminAction(
      request.params.id,
      request.body,
      webRequest.headers,
    );
    return reply.code(status).header("cache-control", "private, no-store").send(body);
  });
};
