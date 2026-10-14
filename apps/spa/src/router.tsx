import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
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
  pricing: () => import("@/pages/pricing"),
  privacy: () => import("@/pages/privacy"),
  terms: () => import("@/pages/terms"),
  devOutbox: () => import("@/pages/dev-outbox"),
  devStripeCheckout: () => import("@/pages/dev-stripe-checkout"),
  devStripePortal: () => import("@/pages/dev-stripe-portal"),
  signIn: () => import("@/pages/sign-in"),
  signUp: () => import("@/pages/sign-up"),
  forgotPassword: () => import("@/pages/forgot-password"),
  resetPassword: () => import("@/pages/reset-password"),
  verifyEmail: () => import("@/pages/verify-email"),
  suspended: () => import("@/pages/suspended"),
  orgLayout: () => import("@/pages/org-layout"),
  overview: () => import("@/pages/overview"),
  inbox: () => import("@/pages/inbox"),
  thread: () => import("@/pages/thread"),
  sent: () => import("@/pages/mail-folder"),
  scheduled: () => import("@/pages/mail-folder"),
  trash: () => import("@/pages/mail-folder"),
  activity: () => import("@/pages/activity"),
  activityEmail: () => import("@/pages/activity-email"),
  compose: () => import("@/pages/compose"),
  notifications: () => import("@/pages/notifications"),
  contacts: () => import("@/pages/contacts"),
  contactDetail: () => import("@/pages/contact-detail"),
  audienceSegments: () => import("@/pages/audience-segments"),
  audienceTopics: () => import("@/pages/audience-topics"),
  audienceProperties: () => import("@/pages/audience-properties"),
  broadcasts: () => import("@/pages/broadcasts"),
  broadcastEditor: () => import("@/pages/broadcast-editor"),
  templates: () => import("@/pages/templates"),
  templateEditor: () => import("@/pages/template-editor"),
  insights: () => import("@/pages/insights"),
  alerts: () => import("@/pages/alerts"),
  incidentDetail: () => import("@/pages/incident-detail"),
  domains: () => import("@/pages/domains"),
  domainDetail: () => import("@/pages/domain-detail"),
  apiKeys: () => import("@/pages/api-keys"),
  settingsGeneral: () => import("@/pages/settings-general"),
  settingsConnections: () => import("@/pages/settings-connections"),
  settingsConnection: () => import("@/pages/settings-connection"),
  settingsSenders: () => import("@/pages/settings-senders"),
  settingsMembers: () => import("@/pages/settings-members"),
  settingsProjects: () => import("@/pages/settings-projects"),
  settingsNotifications: () => import("@/pages/settings-notifications"),
  settingsBilling: () => import("@/pages/settings-billing"),
  settingsUsage: () => import("@/pages/settings-usage"),
  settingsCleanup: () => import("@/pages/settings-cleanup"),
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

const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pricing",
  component: lazyRouteComponent(PAGE_MODULES.pricing, "PricingPage"),
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: lazyRouteComponent(PAGE_MODULES.privacy, "PrivacyPage"),
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: lazyRouteComponent(PAGE_MODULES.terms, "TermsPage"),
});

const devOutboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/outbox",
  component: lazyRouteComponent(PAGE_MODULES.devOutbox, "DevOutboxPage"),
});

const devStripeCheckoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/stripe/checkout/$id",
  component: lazyRouteComponent(PAGE_MODULES.devStripeCheckout, "DevStripeCheckoutPage"),
});

const devStripePortalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/stripe/portal/$id",
  component: lazyRouteComponent(PAGE_MODULES.devStripePortal, "DevStripePortalPage"),
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  validateSearch: z.object({ next: z.string().optional() }),
  component: lazyRouteComponent(PAGE_MODULES.signIn, "SignInPage"),
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-up",
  validateSearch: z.object({ next: z.string().optional() }),
  component: lazyRouteComponent(PAGE_MODULES.signUp, "SignUpPage"),
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  component: lazyRouteComponent(PAGE_MODULES.forgotPassword, "ForgotPasswordPage"),
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  validateSearch: z.object({
    token: z.string().optional(),
    email: z.string().optional(),
  }),
  component: lazyRouteComponent(PAGE_MODULES.resetPassword, "ResetPasswordPage"),
});

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/verify-email",
  validateSearch: z.object({
    email: z.string().optional(),
    next: z.string().optional(),
  }),
  component: lazyRouteComponent(PAGE_MODULES.verifyEmail, "VerifyEmailPage"),
});

const suspendedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/suspended/$orgSlug",
  component: lazyRouteComponent(PAGE_MODULES.suspended, "SuspendedPage"),
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
  component: lazyRouteComponent(PAGE_MODULES.overview, "OverviewPage"),
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

const activityEmailRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/activity/$emailId",
  component: lazyRouteComponent(PAGE_MODULES.activityEmail, "ActivityEmailPage"),
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

const contactDetailRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/audience/contacts/$contactId",
  component: lazyRouteComponent(PAGE_MODULES.contactDetail, "ContactDetailPage"),
});

const audienceSegmentsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/audience/segments",
  component: lazyRouteComponent(PAGE_MODULES.audienceSegments, "AudienceSegmentsPage"),
});

const audienceTopicsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/audience/topics",
  component: lazyRouteComponent(PAGE_MODULES.audienceTopics, "AudienceTopicsPage"),
});

const audiencePropertiesRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/audience/properties",
  component: lazyRouteComponent(PAGE_MODULES.audienceProperties, "AudiencePropertiesPage"),
});

const broadcastsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/broadcasts",
  component: lazyRouteComponent(PAGE_MODULES.broadcasts, "BroadcastsPage"),
});

const broadcastNewRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/broadcasts/new",
  component: lazyRouteComponent(PAGE_MODULES.broadcastEditor, "BroadcastNewPage"),
});

const broadcastDetailRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/broadcasts/$broadcastId",
  component: lazyRouteComponent(PAGE_MODULES.broadcastEditor, "BroadcastDetailPage"),
});

const templatesRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/templates",
  component: lazyRouteComponent(PAGE_MODULES.templates, "TemplatesPage"),
});

const templateNewRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/templates/new",
  component: lazyRouteComponent(PAGE_MODULES.templateEditor, "TemplateNewPage"),
});

const templateDetailRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/templates/$templateId",
  component: lazyRouteComponent(PAGE_MODULES.templateEditor, "TemplateDetailPage"),
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

const incidentDetailRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/alerts/incidents/$incidentId",
  component: lazyRouteComponent(PAGE_MODULES.incidentDetail, "IncidentDetailPage"),
});

const domainsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/domains",
  component: lazyRouteComponent(PAGE_MODULES.domains, "DomainsPage"),
});

const domainDetailRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/domains/$domainId",
  component: lazyRouteComponent(PAGE_MODULES.domainDetail, "DomainDetailPage"),
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

const settingsConnectionRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/connections/$connectionId",
  component: lazyRouteComponent(PAGE_MODULES.settingsConnection, "SettingsConnectionPage"),
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

const settingsUsageRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/usage",
  component: lazyRouteComponent(PAGE_MODULES.settingsUsage, "SettingsUsagePage"),
});

const settingsCleanupRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/settings/cleanup",
  component: lazyRouteComponent(PAGE_MODULES.settingsCleanup, "SettingsCleanupPage"),
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
  pricingRoute,
  privacyRoute,
  termsRoute,
  devOutboxRoute,
  devStripeCheckoutRoute,
  devStripePortalRoute,
  signInRoute,
  signUpRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  verifyEmailRoute,
  suspendedRoute,
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
    activityEmailRoute,
    composeRoute,
    notificationsRoute,
    contactsRoute,
    contactDetailRoute,
    audienceSegmentsRoute,
    audienceTopicsRoute,
    audiencePropertiesRoute,
    broadcastsRoute,
    broadcastNewRoute,
    broadcastDetailRoute,
    templatesRoute,
    templateNewRoute,
    templateDetailRoute,
    insightsRoute,
    alertsRoute,
    incidentDetailRoute,
    domainsRoute,
    domainDetailRoute,
    apiKeysRoute,
    settingsGeneralRoute,
    settingsConnectionsRoute,
    settingsConnectionRoute,
    settingsSendersRoute,
    settingsMembersRoute,
    settingsProjectsRoute,
    settingsNotificationsRoute,
    settingsBillingRoute,
    settingsUsageRoute,
    settingsCleanupRoute,
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
