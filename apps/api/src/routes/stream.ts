import type { FastifyPluginAsync } from "fastify";

import { getOrgContextFromHeaders } from "@/lib/dal-request";
import { isClientDisconnect, openEventStream } from "@/lib/realtime/stream";
import { loadProjectScope, roleIsScopable } from "@/lib/services/project-scope";
import { resolveOrgAccess } from "@/lib/services/tenancy";

import { pipeWebResponse, toWebRequest } from "../http.js";

export const streamRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/stream", async (request, reply) => {
    const webRequest = toWebRequest(request);
    const url = new URL(webRequest.url);
    const orgSlug = url.searchParams.get("orgSlug");
    if (!orgSlug) {
      return reply
        .code(400)
        .header("cache-control", "private, no-store")
        .send({ error: "validation", message: "orgSlug is required." });
    }

    const result = await getOrgContextFromHeaders(orgSlug, webRequest.headers);
    if (result.status === "unauthenticated") {
      return reply
        .code(401)
        .header("cache-control", "private, no-store")
        .send({ error: "unauthenticated", message: "Please sign in again." });
    }
    if (result.status === "not_member") {
      return reply
        .code(404)
        .header("cache-control", "private, no-store")
        .send({ error: "not_found", message: "We couldn't find that workspace." });
    }
    if (result.status === "suspended") {
      return reply
        .code(403)
        .header("cache-control", "private, no-store")
        .send({ error: "workspace_suspended", message: "This workspace is suspended." });
    }
    const { ctx } = result;

    if (request.raw.destroyed) return reply.code(499).send();

    const abort = new AbortController();
    request.raw.on("close", () => abort.abort());

    let body: ReadableStream<Uint8Array>;
    try {
      body = await openEventStream({
        orgId: ctx.org.id,
        userId: ctx.user.id,
        projectScope: ctx.projectScope,
        lastEventId:
          webRequest.headers.get("last-event-id") ?? url.searchParams.get("lastEventId"),
        signal: abort.signal,
        reauthorize: async () => {
          const access = await resolveOrgAccess(ctx.user.id, orgSlug);
          if (!access || access.org.id !== ctx.org.id) return null;
          const projectScope = roleIsScopable(access.role)
            ? await loadProjectScope({
                orgId: access.org.id,
                memberId: access.memberId,
                role: access.role,
              })
            : null;
          return { projectScope };
        },
      });
    } catch (error) {
      if (abort.signal.aborted || isClientDisconnect(error)) return reply.code(499).send();
      throw error;
    }

    return pipeWebResponse(
      reply,
      new Response(body, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "private, no-store, no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        },
      }),
    );
  });
};
