import type { FastifyPluginAsync } from "fastify";

import { getSessionFromHeaders } from "@/lib/dal-request";
import { openAttachmentForUser } from "@/lib/services/attachments";
import { contentDisposition } from "@/lib/storage/disposition";

import { pipeWebResponse, sendWebResponse, toWebRequest } from "../http.js";

export const fileRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { attachmentId: string } }>(
    "/api/files/:attachmentId",
    async (request, reply) => {
      const webRequest = toWebRequest(request);
      const session = await getSessionFromHeaders(webRequest.headers);
      if (!session) return reply.code(401).send("Unauthorized");

      const access = await openAttachmentForUser(session.user.id, request.params.attachmentId);
      if (!access.ok) return reply.code(404).send("Not found");

      const { target } = access;
      switch (target.kind) {
        case "redirect":
          return sendWebResponse(
            reply,
            new Response(null, {
              status: 302,
              headers: {
                location: target.url,
                "cache-control": "private, no-store",
                "referrer-policy": "no-referrer",
              },
            }),
          );
        case "stream":
          return pipeWebResponse(
            reply,
            new Response(new Uint8Array(target.body), {
              headers: {
                "content-type": target.contentType,
                "content-disposition": contentDisposition("attachment", target.filename),
                "content-length": String(target.body.length),
                "x-content-type-options": "nosniff",
                "cache-control": "private, no-store",
              },
            }),
          );
        default:
          return reply.code(404).send("Not found");
      }
    },
  );
};
