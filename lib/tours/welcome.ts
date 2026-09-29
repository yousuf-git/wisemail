import type { TourDefinition } from "./types";

/**
 * First visit to an organization without a connection (TRD §2.11): greeting, the sidebar, the
 * "Connect your first account" card, then the pages the person will live in: connections, inbox,
 * composer. The last step leads to the Connect dialog.
 */
export const welcomeTour: TourDefinition = {
  id: "welcome",
  version: "1.0.0",
  name: "Welcome to Wisemail",
  description: "A one-minute walk from the overview to your first email.",
  trigger: "auto_first_visit",
  autoRoute: "",
  endsWithConnect: true,
  steps: [
    {
      id: "hello",
      route: "",
      title: "Hi, I'm Wizi",
      body: "I'll show you around in about a minute. Use the arrow keys or the buttons, and skip whenever you like.",
      mood: "idle",
    },
    {
      id: "nav",
      route: "",
      selector: '[data-tour="nav"]',
      mobileSelector: '[data-tour="nav-button"]',
      side: "right",
      title: "Everything lives here",
      body: "Mail, audience and health each have their own group. Settings sits at the bottom.",
      mood: "idle",
    },
    {
      id: "connect",
      route: "",
      selector: '[data-tour="connect-card"]',
      side: "top",
      title: "Start with a Resend account",
      body: "Paste a Full access API key and Wisemail syncs your domains, emails and events. It takes about a minute.",
      mood: "idle",
      requires: "connection:create",
    },
    {
      id: "connections",
      route: "settings/connections",
      selector: '[data-tour="connections-add"]',
      side: "bottom",
      title: "Add accounts here",
      body: "Each Resend account is a connection. Wisemail registers its own webhook, so events arrive live.",
      mood: "idle",
      requires: "connection:create",
    },
    {
      id: "inbox",
      route: "inbox",
      selector: '[data-tour="inbox-list"]',
      side: "right",
      title: "Replies land here",
      body: "Conversations show up as they arrive. Replies you send show when they're delivered and opened.",
      mood: "wow",
      requires: "thread:read",
    },
    {
      id: "compose",
      route: "compose",
      selector: '[data-tour="compose-sender"]',
      side: "bottom",
      title: "Write your first email",
      body: "Pick a sender, write in rich text or HTML, and send now or schedule it. Cmd or Ctrl plus Enter sends.",
      mood: "happy",
      requires: "email:send",
    },
  ],
};
