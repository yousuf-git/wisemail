import type { TourDefinition } from "./types";

/** First visit to Compose (TRD §2.11). */
export const composerTour: TourDefinition = {
  id: "composer",
  version: "1.0.0",
  name: "Composer",
  description: "Sender, modes, preview and schedule.",
  trigger: "auto_first_page_visit",
  autoRoute: "compose",
  audience: { requires: ["email:send"] },
  steps: [
    {
      id: "sender",
      route: "compose",
      selector: '[data-tour="compose-sender"]',
      side: "bottom",
      title: "Pick a sender",
      body: "Only active senders on verified domains show here. That keeps Resend happy and delivery clean.",
      mood: "idle",
    },
    {
      id: "modes",
      route: "compose",
      selector: '[data-tour="compose-modes"]',
      side: "bottom",
      title: "Rich, HTML or Template",
      body: "Write in rich text, drop into HTML, or fill a published Resend template. Switch anytime before you send.",
      mood: "thinking",
    },
    {
      id: "preview",
      route: "compose",
      selector: '[data-tour="compose-preview"]',
      side: "left",
      title: "Preview before you send",
      body: "Check desktop and mobile widths, and flip light or dark so the message looks right in the inbox.",
      mood: "wow",
    },
    {
      id: "schedule",
      route: "compose",
      selector: '[data-tour="compose-schedule"]',
      side: "top",
      title: "Send now or schedule",
      body: "Pick a time and timezone, or leave it empty to send immediately. Cmd or Ctrl plus Enter sends.",
      mood: "happy",
    },
  ],
};
