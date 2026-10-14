import type { TourDefinition } from "./types";

/** Owner/Admin first visit to Usage (TRD §2.11). */
export const usageBillingTour: TourDefinition = {
  id: "usage-billing",
  version: "1.0.0",
  name: "Usage and plan",
  description: "Meter, overage and where to change plan.",
  trigger: "auto_first_page_visit",
  autoRoute: "settings/usage",
  audience: { requires: ["billing:manage"] },
  steps: [
    {
      id: "meter",
      route: "settings/usage",
      selector: '[data-tour="usage-meter"]',
      side: "bottom",
      title: "Tracked emails vs allowance",
      body: "Transactional, broadcast and inbound share one meter. The bar shows how close you are to the plan cap.",
      mood: "idle",
    },
    {
      id: "overage",
      route: "settings/usage",
      selector: '[data-tour="usage-meter"]',
      side: "top",
      title: "Projected overage",
      body: "If you go over, Wisemail estimates cost here. Stay under the line or upgrade before a busy month.",
      mood: "thinking",
    },
    {
      id: "plan",
      route: "settings/usage",
      selector: '[data-tour="usage-plan"]',
      side: "top",
      title: "Compare and change plan",
      body: "Manage plan opens billing: upgrade, add seats or buy AI credit packs when you need them.",
      mood: "happy",
    },
  ],
};
