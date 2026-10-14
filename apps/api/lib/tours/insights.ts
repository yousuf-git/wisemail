import type { TourDefinition } from "./types";

/** First visit to Insights (TRD §2.11). */
export const insightsTour: TourDefinition = {
  id: "insights",
  version: "1.0.0",
  name: "Insights",
  description: "Filters, thresholds and what open rate means here.",
  trigger: "auto_first_page_visit",
  autoRoute: "insights",
  audience: { requires: ["insights:read"] },
  steps: [
    {
      id: "filters",
      route: "insights",
      selector: '[data-tour="insights-filters"]',
      side: "bottom",
      title: "Narrow the picture",
      body: "Range, connection, project, domain and stream all filter the same KPIs and charts below.",
      mood: "idle",
    },
    {
      id: "kpis",
      route: "insights",
      selector: '[data-tour="insights-kpis"]',
      side: "bottom",
      title: "Deliverability at a glance",
      body: "Watch bounce and complaint rates against healthy thresholds. Spikes here often show up in Alerts too.",
      mood: "detective",
    },
    {
      id: "open-rate",
      route: "insights",
      selector: '[data-tour="insights-open-note"]',
      side: "top",
      title: "Open rate is estimated",
      body: "Apple Mail Privacy and similar tools inflate opens. Treat the open rate as a signal, not a census.",
      mood: "thinking",
    },
  ],
};
