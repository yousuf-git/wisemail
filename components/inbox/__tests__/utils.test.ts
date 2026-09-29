import { describe, expect, it } from "vitest";

import { eventLabel, statusLabel, statusState } from "@/components/activity/status";
import type { ReceiptSummaryDTO } from "@/lib/dto/mail";
import { buildEmailSrcDoc, EMAIL_FRAME_CSP, estimateFrameHeight } from "../email-frame-utils";
import { avatarColor, displayName, formatBytes, initials, relativeTime } from "../format";
import { deriveReceiptSteps } from "../receipt";
import { inboxHref, parseInboxSegments } from "../routes";
import { fileKind, middleTruncate } from "../attachment-chips";

const NOW = Date.parse("2026-09-29T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const receipts = (over: Partial<ReceiptSummaryDTO> = {}): ReceiptSummaryDTO => ({
  status: "sent",
  sentAt: null,
  deliveredAt: null,
  firstOpenedAt: null,
  lastOpenedAt: null,
  openCount: 0,
  firstClickedAt: null,
  clickCount: 0,
  likelyAutomatedOpen: false,
  opensTracked: true,
  bounce: null,
  events: [],
  ...over,
});

describe("deriveReceiptSteps", () => {
  it("builds Sent · Delivered · Opened Xm ago from the timeline", () => {
    const steps = deriveReceiptSteps(
      receipts({
        status: "opened",
        openCount: 3,
        events: [
          { type: "email.sent", at: ago(600_000) },
          { type: "email.delivered", at: ago(590_000) },
          { type: "email.opened", at: ago(120_000) },
        ],
        firstOpenedAt: ago(120_000),
        lastOpenedAt: ago(30_000),
      }),
      NOW,
    );
    expect(steps.map((s) => [s.key, s.label, s.tone])).toEqual([
      ["sent", "Sent", "info"],
      ["delivered", "Delivered", "ok"],
      ["opened", "Opened 2m ago · 3×", "engaged"],
    ]);
  });

  it("leaves later steps unfilled until they happen", () => {
    const steps = deriveReceiptSteps(
      receipts({ events: [{ type: "email.sent", at: ago(1000) }], sentAt: ago(1000) }),
      NOW,
    );
    expect(steps.map((s) => [s.label, s.tone])).toEqual([
      ["Sent", "info"],
      ["Delivered", "off"],
      ["Opened", "off"],
    ]);
  });

  it("treats a later step as proof of the earlier ones (events arrive out of order)", () => {
    const steps = deriveReceiptSteps(
      receipts({ status: "opened", events: [{ type: "email.opened", at: ago(60_000) }] }),
      NOW,
    );
    expect(steps.map((s) => s.key)).toEqual(["sent", "delivered", "opened"]);
  });

  it("shows failures instead of the delivery step and hides the open step", () => {
    const steps = deriveReceiptSteps(
      receipts({
        status: "bounced",
        bounce: { type: "hard", message: "No such user" },
        events: [
          { type: "email.sent", at: ago(5000) },
          { type: "email.bounced", at: ago(4000) },
        ],
      }),
      NOW,
    );
    expect(steps.map((s) => [s.label, s.tone])).toEqual([
      ["Sent", "info"],
      ["Bounced (hard)", "danger"],
    ]);
    expect(steps[1]!.title).toBe("No such user");
  });

  it("says when opens are not tracked, and marks likely automatic opens", () => {
    const untracked = deriveReceiptSteps(
      receipts({ status: "delivered", opensTracked: false, deliveredAt: ago(1000) }),
      NOW,
    );
    expect(untracked.at(-1)).toMatchObject({
      key: "untracked",
      label: "Opens not tracked",
      href: "checklist",
    });

    const automatic = deriveReceiptSteps(
      receipts({
        status: "opened",
        openCount: 1,
        firstOpenedAt: ago(3000),
        likelyAutomatedOpen: true,
      }),
      NOW,
    );
    expect(automatic.at(-1)!.label).toBe("Opened (likely automatic)");
  });

  it("covers scheduled, delayed, canceled and clicked", () => {
    expect(deriveReceiptSteps(receipts({ status: "scheduled" }), NOW)[0]).toMatchObject({
      label: "Scheduled",
    });
    expect(deriveReceiptSteps(receipts({ status: "canceled" }), NOW)).toHaveLength(1);
    const delayed = deriveReceiptSteps(
      receipts({ status: "delivery_delayed", sentAt: ago(9000) }),
      NOW,
    );
    expect(delayed[1]).toMatchObject({ label: "Delivery delayed", tone: "warning" });
    const clicked = deriveReceiptSteps(
      receipts({ status: "clicked", openCount: 1, clickCount: 2, firstOpenedAt: ago(5000) }),
      NOW,
    );
    expect(clicked.at(-1)!.label).toBe("Clicked · 2×");
  });
});

describe("email frame helpers", () => {
  it("wraps html with the CSP meta and a base target for links", () => {
    const doc = buildEmailSrcDoc({ html: "<p>Hi</p>" });
    expect(doc).toContain(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'">`,
    );
    expect(EMAIL_FRAME_CSP).toBe(
      "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'",
    );
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain("<body><p>Hi</p></body>");
    expect(doc).not.toMatch(/<script/i);
  });

  it("escapes the plain-text fallback", () => {
    const doc = buildEmailSrcDoc({ html: null, text: "1 < 2 <script>alert(1)</script> & more" });
    expect(doc).toContain("1 &lt; 2 &lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    expect(doc).not.toContain("<script>alert");
  });

  it("estimates a bounded height that grows with content", () => {
    const short = estimateFrameHeight({ html: "<p>Hi</p>" });
    const long = estimateFrameHeight({ html: `<p>${"word ".repeat(2000)}</p>` });
    const images = estimateFrameHeight({ html: "<img src=x><img src=y><img src=z>" });
    expect(short).toBeGreaterThanOrEqual(120);
    expect(long).toBe(900);
    expect(images).toBeGreaterThan(short);
    expect(estimateFrameHeight({ text: "a\nb\nc" })).toBeGreaterThan(short - 1);
  });
});

describe("inbox routes", () => {
  const id = "0123456789abcdef01234567";
  it("parses folders and thread ids", () => {
    expect(parseInboxSegments(undefined)).toEqual({ folder: "inbox", threadId: null });
    expect(parseInboxSegments([id])).toEqual({ folder: "inbox", threadId: id });
    expect(parseInboxSegments(["sent"])).toEqual({ folder: "sent", threadId: null });
    expect(parseInboxSegments(["sent", id])).toEqual({ folder: "sent", threadId: id });
    expect(parseInboxSegments(["trash"])).toEqual({ folder: "trash", threadId: null });
  });
  it("rejects anything else", () => {
    for (const bad of [["nope"], [id, id], ["sent", "nope"], ["trash", id, "x"]]) {
      expect(parseInboxSegments(bad)).toBeNull();
    }
  });
  it("builds hrefs", () => {
    expect(inboxHref("acme", "inbox")).toBe("/acme/inbox");
    expect(inboxHref("acme", "inbox", id)).toBe(`/acme/inbox/${id}`);
    expect(inboxHref("acme", "sent", id)).toBe(`/acme/inbox/sent/${id}`);
    expect(inboxHref("acme", "scheduled")).toBe("/acme/scheduled");
  });
});

describe("formatting", () => {
  it("formats relative times", () => {
    expect(relativeTime(ago(10_000), NOW)).toBe("just now");
    expect(relativeTime(ago(120_000), NOW)).toBe("2m ago");
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe("3h ago");
    expect(relativeTime(ago(2 * 86_400_000), NOW)).toBe("2d ago");
  });
  it("formats sizes, names, initials, colors", () => {
    expect(formatBytes(184 * 1024)).toBe("184 KB");
    expect(formatBytes(2.4 * 1024 * 1024)).toBe("2.4 MB");
    expect(displayName("jane@northwind.io")).toBe("jane");
    expect(displayName("jane@northwind.io", "Jane Cooper")).toBe("Jane Cooper");
    expect(initials("Jane Cooper")).toBe("JC");
    expect(initials("github")).toBe("GI");
    expect(avatarColor("a@b.co")).toBe(avatarColor("A@B.CO"));
  });
  it("picks file badges and truncates in the middle", () => {
    expect(fileKind("application/pdf", "x.pdf").label).toBe("PDF");
    expect(fileKind("application/octet-stream", "Übersicht.xlsx").label).toBe("XLS");
    expect(fileKind("application/zip", "assets.zip").label).toBe("ZIP");
    expect(fileKind("image/png", "a.png").label).toBe("IMG");
    expect(middleTruncate("Quarterly-report-final.pdf", 20)).toBe("Quarterly-…final.pdf");
    expect(middleTruncate("short.pdf")).toBe("short.pdf");
  });
  it("maps statuses to FED states", () => {
    expect(statusState("delivered")).toBe("success");
    expect(statusState("opened")).toBe("engaged");
    expect(statusState("bounced")).toBe("danger");
    expect(statusState("delivery_delayed")).toBe("warning");
    expect(statusState("suppressed")).toBe("neutral");
    expect(statusLabel("delivery_delayed")).toBe("Delivery delayed");
    expect(eventLabel("email.delivery_delayed")).toBe("Delivery delayed");
    expect(eventLabel("email.something_new")).toBe("Something new");
  });
});
