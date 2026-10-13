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
  thread: () => import("@/pages/thread"),
  sent: () => import("@/pages/mail-folder"),
  scheduled: () => import("@/pages/mail-folder"),
  trash: () => import("@/pages/mail-folder"),
  activity: () => import("@/pages/activity"),
  compose: () => import("@/pages/compose"),
  notifications: () => import("@/pages/notifications"),
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
  settingsProjects: () => import("@/pages/settings-projects"),
  settingsNotifications: () => import("@/pages/settings-notifications"),
  settingsBilling: () => import("@/pages/settings-billing"),
  settingsAi: () => import("@/pages/settings-ai"),
  settingsAudit: () => import("@/pages/settings-audit"),
  adminLayout: () => import("@/pages/admin-layout"),
  adminOverview: () => import("@/pages/admin-overview"),
  adminUsers: () => import("@/pages/admin-users"),
  adminUser: () => import("@/pages/admin-user"),
  adminOrgs: () => import("@/pages/admin-orgs"),
  adminOrg: () => import("@/pages/admin-org"),
  adminHealth: () => import("@/pages/admin-health"),
  adminPricing: () => import("@/pages/admin-pricing"),
  adminSettings: () => import("@/pages/admin-settings"),
  invite: () => import("@/pages/invite"),
  onboarding: () => import("@/pages/onboarding"),
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

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: lazyRouteComponent(PAGE_MODULES.invite, "InvitePage"),
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: lazyRouteComponent(PAGE_MODULES.onboarding, "OnboardingPage"),
});

/** Static `/admin` must register before `/$orgSlug` so it is not treated as an org slug. */
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: lazyRouteComponent(PAGE_MODULES.adminLayout, "AdminLayoutPage"),
});

const adminIndexRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/",
  component: lazyRouteComponent(PAGE_MODULES.adminOverview, "AdminOverviewPage"),
});

const adminUsersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/users",
  component: lazyRouteComponent(PAGE_MODULES.adminUsers, "AdminUsersPage"),
});

const adminUserRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/users/$userId",
  component: lazyRouteComponent(PAGE_MODULES.adminUser, "AdminUserPage"),
});

const adminOrgsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/organizations",
  component: lazyRouteComponent(PAGE_MODULES.adminOrgs, "AdminOrgsPage"),
});

const adminOrgRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/organizations/$orgId",
  component: lazyRouteComponent(PAGE_MODULES.adminOrg, "AdminOrgPage"),
});

const adminPricingRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/pricing",
  component: lazyRouteComponent(PAGE_MODULES.adminPricing, "AdminPricingPage"),
});

const adminSettingsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/settings",
  component: lazyRouteComponent(PAGE_MODULES.adminSettings, "AdminSettingsPage"),
});

const adminHealthRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/health",
  component: lazyRouteComponent(PAGE_MODULES.adminHealth, "AdminHealthPage"),
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

const threadRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/inbox/$threadId",
  component: lazyRouteComponent(PAGE_MODULES.thread, "ThreadPage"),
});

const sentRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/sent",
  component: lazyRouteComponent(PAGE_MODULES.sent, "SentPage"),
});

const scheduledRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/scheduled",
  component: lazyRouteComponent(PAGE_MODULES.scheduled, "ScheduledPage"),
});

const trashRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/trash",
  component: lazyRouteComponent(PAGE_MODULES.trash, "TrashPage"),
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

const notificationsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/notifications",
  component: lazyRouteComponent(PAGE_MODULES.notifications, "NotificationsPage"),
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

const settingsProjectsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/projects",
  component: lazyRouteComponent(PAGE_MODULES.settingsProjects, "SettingsProjectsPage"),
});

const settingsNotificationsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/notifications",
  component: lazyRouteComponent(PAGE_MODULES.settingsNotifications, "SettingsNotificationsPage"),
});

const settingsBillingRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/billing",
  component: lazyRouteComponent(PAGE_MODULES.settingsBilling, "SettingsBillingPage"),
});

const settingsAiRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/ai",
  component: lazyRouteComponent(PAGE_MODULES.settingsAi, "SettingsAiPage"),
});

const settingsAuditRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/audit",
  component: lazyRouteComponent(PAGE_MODULES.settingsAudit, "SettingsAuditPage"),
});

const splatRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/$",
  component: lazyRouteComponent(PAGE_MODULES.placeholder, "PlaceholderPage"),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  inviteRoute,
  onboardingRoute,
  adminRoute.addChildren([
    adminIndexRoute,
    adminUsersRoute,
    adminUserRoute,
    adminOrgsRoute,
    adminOrgRoute,
    adminPricingRoute,
    adminSettingsRoute,
    adminHealthRoute,
  ]),
  orgRoute.addChildren([
    orgIndexRoute,
    inboxRoute,
    threadRoute,
    sentRoute,
    scheduledRoute,
    trashRoute,
    activityRoute,
    composeRoute,
    notificationsRoute,
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
    settingsProjectsRoute,
    settingsNotificationsRoute,
    settingsBillingRoute,
    settingsAiRoute,
    settingsAuditRoute,
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
