import { toNodeHandler } from "better-auth/node";
import type { FastifyPluginAsync } from "fastify";

import { connectDb } from "@/lib/db/connect";

import { auth } from "../auth.js";

/**
 * Mount Better Auth at `/api/auth/*` via the Node adapter. Content-type parsers are cleared so
 * Better Auth can read the raw Node request stream.
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  const handler = toNodeHandler(auth);

  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", (_request, payload, done) => {
    // Leave the stream unread for Better Auth.
    done(null, undefined);
  });

  app.all("/api/auth/*", async (request, reply) => {
    await connectDb();
    reply.hijack();
    await handler(request.raw, reply.raw);
  });
};
