import type { FastifyPluginAsync } from "fastify";
import { serve } from "inngest/fastify";

import { inngest } from "@/inngest/client";
import { inngestFunctions } from "@/inngest/functions";

/** Inngest serve endpoint — same functions as `apps/web/app/api/inngest`. */
export const inngestRoutes: FastifyPluginAsync = async (app) => {
  const handler = serve({
    client: inngest,
    functions: [...inngestFunctions],
  });

  app.route({
    method: ["GET", "POST", "PUT"],
    url: "/api/inngest",
    handler,
  });
};
