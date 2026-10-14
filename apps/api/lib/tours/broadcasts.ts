import type { TourDefinition } from "./types";

/** First visit to Broadcasts (TRD §2.11). */
export const broadcastsTour: TourDefinition = {
  id: "broadcasts",
  version: "1.0.0",
  name: "Broadcasts",
  description: "Segments, preview and post-send stats.",
  trigger: "auto_first_page_visit",
  autoRoute: "broadcasts",
  audience: { requires: ["broadcast:read"] },
  steps: [
    {
      id: "list",
      route: "broadcasts",
      selector: '[data-tour="broadcasts-list"]',
      side: "top",
      title: "Campaigns in one place",
      body: "Drafts, scheduled and sent broadcasts show here with status. Filter when the list grows.",
      mood: "idle",
    },
    {
      id: "create",
      route: "broadcasts",
      selector: '[data-tour="broadcasts-new"]',
      side: "left",
      title: "Start a broadcast",
      body: "Write the message, pick a segment, preview and send a test, then send or schedule.",
      mood: "happy",
      requires: "broadcast:create",
    },
    {
      id: "stats",
      route: "broadcasts",
      selector: '[data-tour="broadcasts-list"]',
      side: "bottom",
      title: "Stats after you send",
      body: "Open a sent broadcast for delivery and engagement. Refresh pulls the latest from Resend.",
      mood: "wow",
    },
  ],
};
