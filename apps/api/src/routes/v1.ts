import type { FastifyPluginAsync } from "fastify";

import { GET as getActivityEmail } from "@/app/api/v1/activity/[emailId]/route";
import { GET as getActivity } from "@/app/api/v1/activity/route";
import { POST as postAiCompose } from "@/app/api/v1/ai/compose/route";
import { POST as postAiDraft } from "@/app/api/v1/ai/draft/route";
import { POST as postAiExplain } from "@/app/api/v1/ai/explain/route";
import { GET as getAiStatus } from "@/app/api/v1/ai/status/route";
import { GET as getAuditExport } from "@/app/api/v1/audit/export/route";
import { GET as getAudit } from "@/app/api/v1/audit/route";
import { GET as getContacts } from "@/app/api/v1/contacts/route";
import { GET as getIncidents } from "@/app/api/v1/incidents/route";
import { GET as getInsights } from "@/app/api/v1/insights/route";
import { GET as getNotificationsUnread } from "@/app/api/v1/notifications/unread/route";
import { GET as getNotifications } from "@/app/api/v1/notifications/route";
import { GET as getThread } from "@/app/api/v1/threads/[threadId]/route";
import { GET as getThreads } from "@/app/api/v1/threads/route";

import { sendWebResponse, toWebRequest } from "../http.js";

type Params = Record<string, string>;

/** Next App Router handlers — params shape varies per route; cast at the call boundary. */
type AnyRouteHandler = (
  req: Request,
  ctx?: { params: Promise<Params> },
) => Promise<Response> | Response;

async function bridge(
  request: Parameters<typeof toWebRequest>[0],
  reply: Parameters<typeof sendWebResponse>[0],
  handler: AnyRouteHandler,
  params?: Params,
) {
  const webRequest = toWebRequest(request);
  const response = await handler(
    webRequest,
    params ? { params: Promise.resolve(params) } : undefined,
  );
  return sendWebResponse(reply, response);
}

/**
 * Session-authenticated `/api/v1/*` surface. Reuses the Next route handlers during the migration.
 */
export const v1Routes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/threads", (req, reply) => bridge(req, reply, getThreads as AnyRouteHandler));
  app.get<{ Params: { threadId: string } }>("/api/v1/threads/:threadId", (req, reply) =>
    bridge(req, reply, getThread as AnyRouteHandler, req.params),
  );

  app.get("/api/v1/activity", (req, reply) => bridge(req, reply, getActivity as AnyRouteHandler));
  app.get<{ Params: { emailId: string } }>("/api/v1/activity/:emailId", (req, reply) =>
    bridge(req, reply, getActivityEmail as AnyRouteHandler, req.params),
  );

  app.get("/api/v1/notifications", (req, reply) =>
    bridge(req, reply, getNotifications as AnyRouteHandler),
  );
  app.get("/api/v1/notifications/unread", (req, reply) =>
    bridge(req, reply, getNotificationsUnread as AnyRouteHandler),
  );

  app.get("/api/v1/insights", (req, reply) => bridge(req, reply, getInsights as AnyRouteHandler));
  app.get("/api/v1/incidents", (req, reply) => bridge(req, reply, getIncidents as AnyRouteHandler));
  app.get("/api/v1/contacts", (req, reply) => bridge(req, reply, getContacts as AnyRouteHandler));

  app.get("/api/v1/audit", (req, reply) => bridge(req, reply, getAudit as AnyRouteHandler));
  app.get("/api/v1/audit/export", (req, reply) =>
    bridge(req, reply, getAuditExport as AnyRouteHandler),
  );

  app.get("/api/v1/ai/status", (req, reply) => bridge(req, reply, getAiStatus as AnyRouteHandler));
  app.post("/api/v1/ai/compose", (req, reply) =>
    bridge(req, reply, postAiCompose as AnyRouteHandler),
  );
  app.post("/api/v1/ai/draft", (req, reply) => bridge(req, reply, postAiDraft as AnyRouteHandler));
  app.post("/api/v1/ai/explain", (req, reply) =>
    bridge(req, reply, postAiExplain as AnyRouteHandler),
  );
};
