import type { TourDefinition } from "./types";

/**
 * After the first connection syncs (TRD §2.11): checklist → inbox → activity →
 * insights → notifications → ⌘K.
 */
export const firstLookTour: TourDefinition = {
  id: "first-look",
  version: "1.0.0",
  name: "Your workspace at a glance",
  description: "Where mail, health and shortcuts live once Resend is connected.",
  trigger: "auto_after_event",
  autoRoute: "",
  steps: [
    {
      id: "checklist",
      route: "",
      selector: '[data-tour="checklist"]',
      side: "bottom",
      title: "Keep the setup checklist green",
      body: "Tracking, receiving and webhooks show here. Fix anything that needs a look so events stay live.",
      mood: "thinking",
      requires: "connection:read",
    },
    {
      id: "inbox",
      route: "inbox",
      selector: '[data-tour="inbox-list"]',
      side: "right",
      title: "Replies and threads",
      body: "Conversations land here. Open one to see read receipts as delivered and opened.",
      mood: "wow",
      requires: "thread:read",
    },
    {
      id: "receipts",
      route: "inbox",
      selector: '[data-tour="receipt-chip"]',
      side: "bottom",
      title: "Read receipts on sent mail",
      body: "Outbound mail shows sent → delivered → opened. That chip updates as Resend events arrive.",
      mood: "happy",
      requires: "thread:read",
    },
    {
      id: "activity",
      route: "activity",
      selector: '[data-tour="activity-list"]',
      side: "top",
      title: "Every email in one timeline",
      body: "Filter by status, direction or domain when you need the full delivery story.",
      mood: "idle",
      requires: "email:read",
    },
    {
      id: "insights",
      route: "insights",
      selector: '[data-tour="insights-kpis"]',
      side: "bottom",
      title: "Delivery health",
      body: "Bounce, open and delivery rates for the range you pick. Narrow by connection or domain when you need detail.",
      mood: "detective",
      requires: "insights:read",
    },
    {
      id: "bell",
      route: "",
      selector: '[data-tour="notifications-bell"]',
      side: "bottom",
      title: "Bell and live updates",
      body: "New mail, alerts and domain changes show here. The live stream keeps this workspace awake.",
      mood: "idle",
    },
    {
      id: "command",
      route: "",
      selector: '[data-tour="command-palette"]',
      side: "bottom",
      title: "Jump anywhere with ⌘K",
      body: "Open the palette anytime to reach inbox, settings, compose and more without hunting the sidebar.",
      mood: "happy",
    },
  ],
};
