import type { FastifyPluginAsync } from "fastify";

import { GET as getActivityEmail } from "@/app/api/v1/activity/[emailId]/route";
import { GET as getActivity } from "@/app/api/v1/activity/route";
import { POST as postAiCompose } from "@/app/api/v1/ai/compose/route";
import { POST as postAiDraft } from "@/app/api/v1/ai/draft/route";
import { POST as postAiExplain } from "@/app/api/v1/ai/explain/route";
import { GET as getAiStatus } from "@/app/api/v1/ai/status/route";
import { GET as getAiUsage } from "@/app/api/v1/ai/usage/route";
import { GET as getAuditExport } from "@/app/api/v1/audit/export/route";
import { GET as getAuditFilters } from "@/app/api/v1/audit/filters/route";
import { GET as getAudit } from "@/app/api/v1/audit/route";
import { GET as getAlertRules } from "@/app/api/v1/alert-rules/route";
import { GET as getApiKeys } from "@/app/api/v1/api-keys/route";
import { GET as getBroadcast } from "@/app/api/v1/broadcasts/[broadcastId]/route";
import { GET as getBroadcastOptions } from "@/app/api/v1/broadcasts/options/route";
import { GET as getBroadcasts } from "@/app/api/v1/broadcasts/route";
import { GET as getTemplate } from "@/app/api/v1/templates/[templateId]/route";
import { GET as getConnection } from "@/app/api/v1/connections/[connectionId]/route";
import { GET as getConnections } from "@/app/api/v1/connections/route";
import { GET as getAudienceOptions } from "@/app/api/v1/audience/options/route";
import { GET as getContact } from "@/app/api/v1/contacts/[contactId]/route";
import { GET as getContacts } from "@/app/api/v1/contacts/route";
import { GET as getDomain } from "@/app/api/v1/domains/[domainId]/route";
import { GET as getDomains } from "@/app/api/v1/domains/route";
import { GET as getProperties } from "@/app/api/v1/properties/route";
import { GET as getSegments } from "@/app/api/v1/segments/route";
import { GET as getTopics } from "@/app/api/v1/topics/route";
import { GET as getIncident } from "@/app/api/v1/incidents/[incidentId]/route";
import { GET as getIncidents } from "@/app/api/v1/incidents/route";
import { GET as getInsightOptions } from "@/app/api/v1/insights/options/route";
import { GET as getInsights } from "@/app/api/v1/insights/route";
import { GET as getMembers } from "@/app/api/v1/members/route";
import { GET as getProjects } from "@/app/api/v1/projects/route";
import { GET as getTemplates } from "@/app/api/v1/templates/route";
import { GET as getTemplateOptions } from "@/app/api/v1/templates/options/route";
import { GET as getTours } from "@/app/api/v1/tours/route";
import { GET as getNotificationsUnread } from "@/app/api/v1/notifications/unread/route";
import { GET as getNotifications } from "@/app/api/v1/notifications/route";
import { GET as getOverview } from "@/app/api/v1/overview/route";
import { GET as getSenders } from "@/app/api/v1/senders/route";
import { GET as getSettingsBilling } from "@/app/api/v1/settings/billing/route";
import { GET as getSettingsCleanup } from "@/app/api/v1/settings/cleanup/route";
import { GET as getSettingsGeneral } from "@/app/api/v1/settings/general/route";
import { GET as getSettingsNotifications } from "@/app/api/v1/settings/notifications/route";
import { GET as getSettingsUsage } from "@/app/api/v1/settings/usage/route";
import { GET as getThread } from "@/app/api/v1/threads/[threadId]/route";
import { GET as getThreads } from "@/app/api/v1/threads/route";
import { GET as getUsageSummary } from "@/app/api/v1/usage/summary/route";

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

  app.get("/api/v1/insights/options", (req, reply) =>
    bridge(req, reply, getInsightOptions as AnyRouteHandler),
  );
  app.get("/api/v1/insights", (req, reply) => bridge(req, reply, getInsights as AnyRouteHandler));
  app.get("/api/v1/incidents", (req, reply) => bridge(req, reply, getIncidents as AnyRouteHandler));
  app.get<{ Params: { incidentId: string } }>("/api/v1/incidents/:incidentId", (req, reply) =>
    bridge(req, reply, getIncident as AnyRouteHandler, req.params),
  );
  app.get("/api/v1/alert-rules", (req, reply) =>
    bridge(req, reply, getAlertRules as AnyRouteHandler),
  );
  app.get("/api/v1/contacts", (req, reply) => bridge(req, reply, getContacts as AnyRouteHandler));
  app.get<{ Params: { contactId: string } }>("/api/v1/contacts/:contactId", (req, reply) =>
    bridge(req, reply, getContact as AnyRouteHandler, req.params),
  );
  app.get("/api/v1/audience/options", (req, reply) =>
    bridge(req, reply, getAudienceOptions as AnyRouteHandler),
  );
  app.get("/api/v1/segments", (req, reply) => bridge(req, reply, getSegments as AnyRouteHandler));
  app.get("/api/v1/topics", (req, reply) => bridge(req, reply, getTopics as AnyRouteHandler));
  app.get("/api/v1/properties", (req, reply) =>
    bridge(req, reply, getProperties as AnyRouteHandler),
  );
  app.get("/api/v1/broadcasts", (req, reply) =>
    bridge(req, reply, getBroadcasts as AnyRouteHandler),
  );
  app.get("/api/v1/broadcasts/options", (req, reply) =>
    bridge(req, reply, getBroadcastOptions as AnyRouteHandler),
  );
  app.get<{ Params: { broadcastId: string } }>("/api/v1/broadcasts/:broadcastId", (req, reply) =>
    bridge(req, reply, getBroadcast as AnyRouteHandler, req.params),
  );
  app.get("/api/v1/templates", (req, reply) => bridge(req, reply, getTemplates as AnyRouteHandler));
  app.get("/api/v1/templates/options", (req, reply) =>
    bridge(req, reply, getTemplateOptions as AnyRouteHandler),
  );
  app.get<{ Params: { templateId: string } }>("/api/v1/templates/:templateId", (req, reply) =>
    bridge(req, reply, getTemplate as AnyRouteHandler, req.params),
  );
  app.get("/api/v1/connections", (req, reply) =>
    bridge(req, reply, getConnections as AnyRouteHandler),
  );
  app.get<{ Params: { connectionId: string } }>("/api/v1/connections/:connectionId", (req, reply) =>
    bridge(req, reply, getConnection as AnyRouteHandler, req.params),
  );
  app.get("/api/v1/domains", (req, reply) => bridge(req, reply, getDomains as AnyRouteHandler));
  app.get<{ Params: { domainId: string } }>("/api/v1/domains/:domainId", (req, reply) =>
    bridge(req, reply, getDomain as AnyRouteHandler, req.params),
  );
  app.get("/api/v1/members", (req, reply) => bridge(req, reply, getMembers as AnyRouteHandler));
  app.get("/api/v1/api-keys", (req, reply) => bridge(req, reply, getApiKeys as AnyRouteHandler));
  app.get("/api/v1/senders", (req, reply) => bridge(req, reply, getSenders as AnyRouteHandler));
  app.get("/api/v1/projects", (req, reply) => bridge(req, reply, getProjects as AnyRouteHandler));
  app.get("/api/v1/settings/general", (req, reply) =>
    bridge(req, reply, getSettingsGeneral as AnyRouteHandler),
  );
  app.get("/api/v1/settings/notifications", (req, reply) =>
    bridge(req, reply, getSettingsNotifications as AnyRouteHandler),
  );
  app.get("/api/v1/settings/billing", (req, reply) =>
    bridge(req, reply, getSettingsBilling as AnyRouteHandler),
  );
  app.get("/api/v1/settings/usage", (req, reply) =>
    bridge(req, reply, getSettingsUsage as AnyRouteHandler),
  );
  app.get("/api/v1/settings/cleanup", (req, reply) =>
    bridge(req, reply, getSettingsCleanup as AnyRouteHandler),
  );

  app.get("/api/v1/overview", (req, reply) => bridge(req, reply, getOverview as AnyRouteHandler));
  app.get("/api/v1/usage/summary", (req, reply) =>
    bridge(req, reply, getUsageSummary as AnyRouteHandler),
  );

  app.get("/api/v1/audit", (req, reply) => bridge(req, reply, getAudit as AnyRouteHandler));
  app.get("/api/v1/audit/filters", (req, reply) =>
    bridge(req, reply, getAuditFilters as AnyRouteHandler),
  );
  app.get("/api/v1/audit/export", (req, reply) =>
    bridge(req, reply, getAuditExport as AnyRouteHandler),
  );

  app.get("/api/v1/ai/status", (req, reply) => bridge(req, reply, getAiStatus as AnyRouteHandler));
  app.get("/api/v1/ai/usage", (req, reply) => bridge(req, reply, getAiUsage as AnyRouteHandler));
  app.post("/api/v1/ai/compose", (req, reply) =>
    bridge(req, reply, postAiCompose as AnyRouteHandler),
  );
  app.post("/api/v1/ai/draft", (req, reply) => bridge(req, reply, postAiDraft as AnyRouteHandler));
  app.post("/api/v1/ai/explain", (req, reply) =>
    bridge(req, reply, postAiExplain as AnyRouteHandler),
  );

  app.get("/api/v1/tours", (req, reply) => bridge(req, reply, getTours as AnyRouteHandler));
};
