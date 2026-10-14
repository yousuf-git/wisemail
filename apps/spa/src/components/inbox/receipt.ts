import type { ReceiptSummary } from "@/lib/api";

import { relativeTime } from "./format";

export type StepTone = "off" | "info" | "ok" | "engaged" | "warning" | "danger" | "neutral";

export type ReceiptStep = {
  key: string;
  label: string;
  tone: StepTone;
  title?: string;
  href?: "checklist";
};

const at = (receipts: ReceiptSummary, type: string) =>
  receipts.events.find((e) => e.type === type)?.at ?? null;
const has = (receipts: ReceiptSummary, type: string) =>
  receipts.events.some((e) => e.type === type);

const exact = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Read-receipt progression for one outbound message (FED §5). */
export function deriveReceiptSteps(receipts: ReceiptSummary, now: number): ReceiptStep[] {
  const { status } = receipts;
  if (status === "canceled") return [{ key: "canceled", label: "Canceled", tone: "neutral" }];

  const opened =
    receipts.openCount > 0 || !!receipts.firstOpenedAt || has(receipts, "email.opened");
  const clicked =
    receipts.clickCount > 0 || !!receipts.firstClickedAt || has(receipts, "email.clicked");
  const delivered = !!receipts.deliveredAt || has(receipts, "email.delivered") || opened || clicked;
  const sentAt = receipts.sentAt ?? at(receipts, "email.sent");
  const sent =
    !!sentAt ||
    delivered ||
    has(receipts, "email.bounced") ||
    has(receipts, "email.delivery_delayed");
  const steps: ReceiptStep[] = [];

  if (sent) {
    steps.push({
      key: "sent",
      label: "Sent",
      tone: "info",
      title: sentAt ? `Sent ${exact(sentAt)}` : undefined,
    });
  } else if (status === "failed") {
    steps.push({ key: "failed", label: "Failed", tone: "danger" });
  } else if (status === "scheduled") {
    steps.push({ key: "scheduled", label: "Scheduled", tone: "info" });
  } else {
    steps.push({ key: "queued", label: "Sending", tone: "info" });
  }

  const bounced = status === "bounced" || has(receipts, "email.bounced");
  const complained = status === "complained" || has(receipts, "email.complained");
  if (bounced) {
    const kind = receipts.bounce?.type;
    steps.push({
      key: "bounced",
      label: kind ? `Bounced (${kind})` : "Bounced",
      tone: "danger",
      title: receipts.bounce?.message ?? undefined,
    });
  } else if (status === "failed" && sent) {
    steps.push({ key: "failed", label: "Failed", tone: "danger" });
  } else if (status === "suppressed") {
    steps.push({ key: "suppressed", label: "Suppressed", tone: "neutral" });
  } else if (delivered) {
    const deliveredAt = receipts.deliveredAt ?? at(receipts, "email.delivered");
    steps.push({
      key: "delivered",
      label: "Delivered",
      tone: "ok",
      title: deliveredAt ? `Delivered ${exact(deliveredAt)}` : undefined,
    });
  } else if (status === "delivery_delayed" || has(receipts, "email.delivery_delayed")) {
    steps.push({ key: "delayed", label: "Delivery delayed", tone: "warning" });
  } else {
    steps.push({ key: "delivered", label: "Delivered", tone: "off" });
  }

  const failedOutcome = bounced || status === "failed" || status === "suppressed";
  if (complained) steps.push({ key: "complained", label: "Complained", tone: "danger" });

  if (!failedOutcome) {
    if (opened) {
      const first = receipts.firstOpenedAt ?? at(receipts, "email.opened");
      const last = receipts.lastOpenedAt ?? first;
      const count = receipts.openCount > 1 ? ` · ${receipts.openCount}×` : "";
      const label = receipts.likelyAutomatedOpen
        ? `Opened (likely automatic)${count}`
        : `Opened${first && now ? ` ${relativeTime(first, now)}` : ""}${count}`;
      steps.push({
        key: "opened",
        label,
        tone: "engaged",
        title: first
          ? `First opened ${exact(first)}${last && last !== first ? ` · last ${exact(last)}` : ""}`
          : undefined,
      });
    } else if (!receipts.opensTracked) {
      steps.push({ key: "untracked", label: "Opens not tracked", tone: "off", href: "checklist" });
    } else {
      steps.push({ key: "opened", label: "Opened", tone: "off" });
    }
    if (clicked) {
      steps.push({
        key: "clicked",
        label: `Clicked${receipts.clickCount > 1 ? ` · ${receipts.clickCount}×` : ""}`,
        tone: "engaged",
        title: receipts.firstClickedAt
          ? `First clicked ${exact(receipts.firstClickedAt)}`
          : undefined,
      });
    }
  }
  return steps;
}
