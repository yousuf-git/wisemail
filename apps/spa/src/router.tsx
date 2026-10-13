import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

export type RouterContext = {
  queryClient: QueryClient;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

/** Explicit lazy map — Vite can analyze every entry (`bundle-dynamic-imports`). */
const PAGE_MODULES = {
  home: () => import("@/pages/home"),
  signIn: () => import("@/pages/sign-in"),
  orgLayout: () => import("@/pages/org-layout"),
  inbox: () => import("@/pages/inbox"),
  scheduled: () => import("@/pages/mail-folder"),
  activity: () => import("@/pages/activity"),
  compose: () => import("@/pages/compose"),
  contacts: () => import("@/pages/contacts"),
  broadcasts: () => import("@/pages/broadcasts"),
  templates: () => import("@/pages/templates"),
  insights: () => import("@/pages/insights"),
  alerts: () => import("@/pages/alerts"),
  domains: () => import("@/pages/domains"),
  apiKeys: () => import("@/pages/api-keys"),
  settingsGeneral: () => import("@/pages/settings-general"),
  settingsConnections: () => import("@/pages/settings-connections"),
  settingsSenders: () => import("@/pages/settings-senders"),
  settingsMembers: () => import("@/pages/settings-members"),
  placeholder: () => import("@/pages/placeholder"),
} as const;

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(PAGE_MODULES.home, "HomePage"),
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  validateSearch: z.object({ next: z.string().optional() }),
  component: lazyRouteComponent(PAGE_MODULES.signIn, "SignInPage"),
});

const orgRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$orgSlug",
  component: lazyRouteComponent(PAGE_MODULES.orgLayout, "OrgLayoutPage"),
});

const orgIndexRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$orgSlug/inbox",
      params: { orgSlug: params.orgSlug },
    });
  },
});

const inboxRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/inbox",
  component: lazyRouteComponent(PAGE_MODULES.inbox, "InboxPage"),
});

const scheduledRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/scheduled",
  component: lazyRouteComponent(PAGE_MODULES.scheduled, "ScheduledPage"),
});

const activityRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/activity",
  component: lazyRouteComponent(PAGE_MODULES.activity, "ActivityPage"),
});

const composeRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/compose",
  component: lazyRouteComponent(PAGE_MODULES.compose, "ComposePage"),
});

const contactsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/audience/contacts",
  component: lazyRouteComponent(PAGE_MODULES.contacts, "ContactsPage"),
});

const broadcastsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/broadcasts",
  component: lazyRouteComponent(PAGE_MODULES.broadcasts, "BroadcastsPage"),
});

const templatesRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/templates",
  component: lazyRouteComponent(PAGE_MODULES.templates, "TemplatesPage"),
});

const insightsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/insights",
  component: lazyRouteComponent(PAGE_MODULES.insights, "InsightsPage"),
});

const alertsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/alerts",
  component: lazyRouteComponent(PAGE_MODULES.alerts, "AlertsPage"),
});

const domainsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/domains",
  component: lazyRouteComponent(PAGE_MODULES.domains, "DomainsPage"),
});

const apiKeysRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/api-keys",
  component: lazyRouteComponent(PAGE_MODULES.apiKeys, "ApiKeysPage"),
});

const settingsGeneralRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/general",
  component: lazyRouteComponent(PAGE_MODULES.settingsGeneral, "SettingsGeneralPage"),
});

const settingsConnectionsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/connections",
  component: lazyRouteComponent(PAGE_MODULES.settingsConnections, "SettingsConnectionsPage"),
});

const settingsSendersRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/senders",
  component: lazyRouteComponent(PAGE_MODULES.settingsSenders, "SettingsSendersPage"),
});

const settingsMembersRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/members",
  component: lazyRouteComponent(PAGE_MODULES.settingsMembers, "SettingsMembersPage"),
});

const splatRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/$",
  component: lazyRouteComponent(PAGE_MODULES.placeholder, "PlaceholderPage"),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  orgRoute.addChildren([
    orgIndexRoute,
    inboxRoute,
    scheduledRoute,
    activityRoute,
    composeRoute,
    contactsRoute,
    broadcastsRoute,
    templatesRoute,
    insightsRoute,
    alertsRoute,
    domainsRoute,
    apiKeysRoute,
    settingsGeneralRoute,
    settingsConnectionsRoute,
    settingsSendersRoute,
    settingsMembersRoute,
    splatRoute,
  ]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
