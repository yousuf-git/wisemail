import type { TourDefinition } from "./types";

/** First visit to Alerts (TRD §2.11). */
export const alertsTour: TourDefinition = {
  id: "alerts",
  version: "1.0.0",
  name: "Alerts",
  description: "Rules, channels and incidents.",
  trigger: "auto_first_page_visit",
  autoRoute: "alerts",
  audience: { requires: ["alertRule:read"] },
  steps: [
    {
      id: "incidents",
      route: "alerts",
      selector: '[data-tour="alerts-incidents"]',
      side: "bottom",
      title: "Incidents that need a look",
      body: "When a rule fires, an incident opens here. Acknowledge it so your team knows someone is on it.",
      mood: "worried",
    },
    {
      id: "rules",
      route: "alerts",
      selector: '[data-tour="alerts-rules"]',
      side: "top",
      title: "Rules watch the numbers",
      body: "Pick a kind like bounce rate, set a threshold, and Wisemail opens an incident when it crosses the line.",
      mood: "thinking",
      requires: "alertRule:create",
    },
    {
      id: "channels",
      route: "alerts",
      selector: '[data-tour="alerts-new"]',
      side: "left",
      title: "Create a rule",
      body: "New rules notify in-app. Email and other channels follow your notification preferences.",
      mood: "happy",
      requires: "alertRule:create",
    },
  ],
};
