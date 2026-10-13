import { describe, expect, it } from "vitest";

import { EMAIL_STATUSES } from "@/lib/db/models/emails";
import { EVENT_STATUS, STATUS_RANK, nextStatus } from "@/lib/mail/status";
import { applyEmailEvent, type EmailState } from "@/lib/services/events-processing";

const fresh = (status: EmailState["status"] = "queued"): EmailState => ({
  status,
  openCount: 0,
  clickCount: 0,
  likelyAutomatedOpen: false,
});
const at = (s: string) => new Date(`2026-09-29T${s}Z`);

describe("status ranking", () => {
  it("ranks every status", () => {
    for (const status of EMAIL_STATUSES) expect(STATUS_RANK[status]).toBeTypeOf("number");
  });

  it("keeps the highest state", () => {
    expect(nextStatus("opened", "delivered")).toBe("opened");
    expect(nextStatus("delivered", "opened")).toBe("opened");
    expect(nextStatus("clicked", "opened")).toBe("clicked");
    expect(nextStatus("sent", "queued")).toBe("sent");
    expect(nextStatus("delivered", "bounced")).toBe("bounced");
    expect(nextStatus("bounced", "opened")).toBe("bounced");
    expect(nextStatus("bounced", "complained")).toBe("complained");
    expect(nextStatus(null, "sent")).toBe("sent");
  });

  it("maps events to statuses", () => {
    expect(EVENT_STATUS["email.delivery_delayed"]).toBe("delivery_delayed");
    expect(EVENT_STATUS["email.received"]).toBe("received");
  });
});

describe("applyEmailEvent (out-of-order safe)", () => {
  const events = [
    { type: "email.sent", occurredAt: at("10:00:00") },
    { type: "email.delivered", occurredAt: at("10:00:04") },
    { type: "email.opened", occurredAt: at("10:05:00") },
    { type: "email.clicked", occurredAt: at("10:06:00") },
  ];

  it("ends in the same state for every arrival order", () => {
    const orders = [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
      [2, 0, 3, 1],
      [1, 3, 0, 2],
    ];
    const results = orders.map((order) => {
      const state = fresh();
      for (const i of order) applyEmailEvent(state, { ...events[i]!, data: {} });
      return state;
    });
    for (const state of results) {
      expect(state.status).toBe("clicked");
      expect(state.sentAt).toEqual(at("10:00:00"));
      expect(state.deliveredAt).toEqual(at("10:00:04"));
      expect(state.firstOpenedAt).toEqual(at("10:05:00"));
      expect(state.openCount).toBe(1);
      expect(state.clickCount).toBe(1);
    }
  });

  it("keeps earliest first-open and latest last-open regardless of order", () => {
    const state = fresh("delivered");
    applyEmailEvent(state, { type: "email.opened", occurredAt: at("11:00:00"), data: {} });
    applyEmailEvent(state, { type: "email.opened", occurredAt: at("10:30:00"), data: {} });
    expect(state.openCount).toBe(2);
    expect(state.firstOpenedAt).toEqual(at("10:30:00"));
    expect(state.lastOpenedAt).toEqual(at("11:00:00"));
  });

  it("counts a unique open once and totals every open", () => {
    const state = fresh();
    const first = applyEmailEvent(state, {
      type: "email.opened",
      occurredAt: at("10:00:00"),
      data: {},
    });
    const second = applyEmailEvent(state, {
      type: "email.opened",
      occurredAt: at("10:01:00"),
      data: {},
    });
    expect(first.counters).toEqual({ opened_total: 1, opened_unique: 1 });
    expect(second.counters).toEqual({ opened_total: 1 });
  });

  it("measures delivery latency once both sides are known, in either order", () => {
    const a = fresh();
    expect(
      applyEmailEvent(a, { type: "email.sent", occurredAt: at("10:00:00"), data: {} }).latencyMs,
    ).toBeUndefined();
    expect(
      applyEmailEvent(a, { type: "email.delivered", occurredAt: at("10:00:03"), data: {} })
        .latencyMs,
    ).toBe(3000);
    const b = fresh();
    expect(
      applyEmailEvent(b, { type: "email.delivered", occurredAt: at("10:00:03"), data: {} })
        .latencyMs,
    ).toBeUndefined();
    expect(
      applyEmailEvent(b, { type: "email.sent", occurredAt: at("10:00:00"), data: {} }).latencyMs,
    ).toBe(3000);
  });

  it("flags an open right after delivery as likely automatic", () => {
    const state = fresh();
    applyEmailEvent(state, { type: "email.delivered", occurredAt: at("10:00:00"), data: {} });
    applyEmailEvent(state, { type: "email.opened", occurredAt: at("10:00:05"), data: {} });
    expect(state.likelyAutomatedOpen).toBe(true);
    const later = fresh();
    applyEmailEvent(later, { type: "email.delivered", occurredAt: at("10:00:00"), data: {} });
    applyEmailEvent(later, { type: "email.opened", occurredAt: at("10:30:00"), data: {} });
    expect(later.likelyAutomatedOpen).toBe(false);
  });

  it("records bounce type and failure reasons", () => {
    const state = fresh("delivered");
    const hard = applyEmailEvent(state, {
      type: "email.bounced",
      occurredAt: at("10:00:00"),
      data: { bounce: { type: "Permanent", subType: "General", message: "no such user" } },
    });
    expect(hard.counters.bounced_hard).toBe(1);
    expect(state.bounce).toMatchObject({ type: "hard", message: "no such user" });
    const soft = applyEmailEvent(fresh(), {
      type: "email.bounced",
      occurredAt: at("10:00:00"),
      data: { bounce: { type: "Transient" } },
    });
    expect(soft.counters.bounced_soft).toBe(1);
    const failed = fresh();
    applyEmailEvent(failed, {
      type: "email.failed",
      occurredAt: at("10:00:00"),
      data: { failed: { reason: "boom" } },
    });
    expect(failed.status).toBe("failed");
    expect(failed.sendError).toEqual({ code: "failed", message: "boom" });
  });
});
