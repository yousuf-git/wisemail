import {
  PLAN_CATALOG,
  FREE_GRACE_DAYS,
  FREE_OVER_ALLOWANCE_RETENTION_DAYS,
  TRIAL_DAYS,
} from "@/lib/billing/plans";

// Plain module (not "use client") so server pages can read the data.
export const faqItems = [
  {
    q: "Do I still need Resend?",
    a: "Yes. Wisemail connects to your Resend account — you keep sending and paying Resend. We add inbox, history, insights and alerts on top.",
  },
  {
    q: "What does Wisemail need from my Resend account?",
    a: "A full-access API key so we can read domains and register a webhook. Sending-only keys are rejected. The webhook uses one of your Resend webhook slots.",
  },
  {
    q: "Is my API key safe?",
    a: "Encrypted at rest with AES-256-GCM and a per-record data key. Decrypted only on the server to talk to Resend — never sent to your browser. You only see the last four characters.",
  },
  {
    q: "What counts as a tracked email?",
    a: "Each email you send, each broadcast recipient, and each email you receive. Events on the same email are included. A broadcast to 10,000 contacts counts as 10,000.",
  },
  {
    q: "What happens if I go over my allowance?",
    a: `We keep collecting events. Paid plans bill overage at period end. On Free, after a ${FREE_GRACE_DAYS}-day grace the extras are kept for ${FREE_OVER_ALLOWANCE_RETENTION_DAYS} days instead of ${PLAN_CATALOG.free.limits.retentionDays}.`,
  },
  {
    q: "Are open rates accurate?",
    a: "Open tracking uses a tiny image; privacy features can inflate it. We label opens as estimates and treat delivery and bounce data as solid.",
  },
  {
    q: "Can I delete emails?",
    a: "Yes — Trash for 30 days with undo, then permanent delete for Owners and Admins. Resend keeps its own copy until its retention ends.",
  },
  {
    q: "What happens if I disconnect or cancel?",
    a: "Disconnect removes our webhook and encrypted key, and — after confirm — synced data. Cancel runs to period end, then Free.",
  },
  {
    q: "Does AI read my email?",
    a: "Paid plans only. Admins can turn it off. We strip quoted history and signatures, never send attachments, and never auto-send drafts.",
  },
  {
    q: "Is there a free trial?",
    a: `New workspaces get Pro for ${TRIAL_DAYS} days with no card. Then pick a plan or stay on Free.`,
  },
];
