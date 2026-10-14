import type { TourDefinition } from "./types";

/** First visit to Inbox (TRD §2.11). */
export const inboxTour: TourDefinition = {
  id: "inbox",
  version: "1.0.0",
  name: "Inbox basics",
  description: "Mailboxes, the thread list, and how replies work.",
  trigger: "auto_first_page_visit",
  autoRoute: "inbox",
  audience: { requires: ["thread:read"] },
  steps: [
    {
      id: "mailboxes",
      route: "inbox",
      selector: '[data-tour="nav"]',
      mobileSelector: '[data-tour="nav-button"]',
      side: "right",
      title: "Inbox, Sent, Scheduled, Trash",
      body: "Mail lives in these folders. Scheduled holds what you queued; Trash keeps items for a while before they go for good.",
      mood: "idle",
    },
    {
      id: "list",
      route: "inbox",
      selector: '[data-tour="inbox-list"]',
      side: "right",
      title: "Your thread list",
      body: "Search, unread and AI categories (when on) filter this list. Select rows to move several to Trash at once.",
      mood: "wow",
    },
    {
      id: "receipts",
      route: "inbox",
      selector: '[data-tour="receipt-chip"]',
      side: "bottom",
      title: "Read-receipt progression",
      body: "On sent mail, receipts move from sent to delivered to opened as events arrive from Resend.",
      mood: "happy",
    },
    {
      id: "reply",
      route: "inbox",
      selector: '[data-tour="inbox-reply"]',
      side: "left",
      title: "Reply and AI draft",
      body: "Open a thread to reply. On plans with AI, draft a reply in a tone you pick without leaving the conversation.",
      mood: "thinking",
      requires: "email:send",
    },
  ],
};
