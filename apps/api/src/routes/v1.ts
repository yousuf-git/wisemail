import type { FastifyPluginAsync } from "fastify";

import { orgRoute, type OrgRouteHandler } from "@/app/api/v1/_lib/org-api";
import { threadsQuery } from "@/app/api/v1/_lib/queries";
import { listThreads } from "@/lib/services/emails";

import { sendWebResponse, toWebRequest } from "../http.js";

/**
 * Session-authenticated `/api/v1/*` surface. Handlers reuse web `orgRoute` + services during the
 * migration; more endpoints are added as clients move off Next route handlers.
 */
export const v1Routes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/threads", async (request, reply) => {
    const webRequest = toWebRequest(request);
    const handler: OrgRouteHandler = ({ ctx, searchParams }) => {
      const query = threadsQuery.parse(Object.fromEntries(searchParams));
      return listThreads(ctx, query);
    };
    const response = await orgRoute(webRequest, handler);
    return sendWebResponse(reply, response);
  });
};
