import { describe, expect, it } from "vitest";

import { roleHasPermission, type Permission } from "@/lib/auth/permissions";
import {
  getTour,
  isNewerMajor,
  MIN_STEPS,
  shouldAutoStart,
  stepsFor,
  toStateDTO,
  tourAvailable,
  TOURS,
} from "@/lib/tours";
import { buildTour } from "@/lib/tours/build-tour";

const can = (role: string) => (p: Permission) => roleHasPermission(role, p);
const welcome = getTour("welcome")!;

describe("tour definitions", () => {
  it("every step has a data-tour selector or is a centered card; targets never use classes", () => {
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        for (const sel of [step.selector, step.mobileSelector]) {
          if (sel) expect(sel).toMatch(/^\[data-tour="[a-z-]+"\]$/);
        }
        expect(step.body.split(/[.!?]\s/).length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("lists the launch tours from TRD §2.11", () => {
    expect(TOURS.map((t) => t.id)).toEqual([
      "welcome",
      "first-look",
      "inbox",
      "composer",
      "insights",
      "alerts",
      "broadcasts",
      "usage-billing",
    ]);
  });

  it("the welcome tour spans overview, help, connections, inbox and compose", () => {
    expect(welcome.steps.map((s) => s.route)).toEqual([
      "",
      "",
      "",
      "",
      "settings/connections",
      "inbox",
      "compose",
    ]);
    expect(welcome.steps.map((s) => s.id)).toContain("help");
  });
});

describe("audience and plan filtering", () => {
  it("leaves out steps for pages the role cannot use", () => {
    const owner = stepsFor(welcome, can("owner")).map((s) => s.id);
    expect(owner).toEqual(["hello", "nav", "connect", "help", "connections", "inbox", "compose"]);
    const support = stepsFor(welcome, can("support")).map((s) => s.id);
    expect(support).not.toContain("connect");
    expect(support).not.toContain("connections");
    expect(support).toContain("inbox");
    expect(support).toContain("help");
    const viewer = stepsFor(welcome, can("viewer")).map((s) => s.id);
    expect(viewer).toEqual(["hello", "nav", "help", "inbox"]);
  });

  it("does not offer a tour with fewer than two steps", () => {
    const tiny = { ...welcome, steps: welcome.steps.slice(0, 1) };
    expect(MIN_STEPS).toBe(2);
    expect(tourAvailable(tiny, can("owner"))).toBe(false);
    const gated = { ...welcome, audience: { requires: ["billing:manage" as const] } };
    expect(tourAvailable(gated, can("admin"))).toBe(false);
    expect(tourAvailable(gated, can("owner"))).toBe(true);
  });
});

describe("auto start", () => {
  const ctx = { pathname: "/acme", orgSlug: "acme", hasConnection: false };

  it("starts welcome on the overview of an org without a connection, once", () => {
    expect(shouldAutoStart(welcome, null, ctx)).toBe(true);
    expect(shouldAutoStart(welcome, null, { ...ctx, pathname: "/acme/inbox" })).toBe(false);
    expect(shouldAutoStart(welcome, null, { ...ctx, hasConnection: true })).toBe(false);
  });

  it("starts first-look on overview once a connection exists", () => {
    const firstLook = getTour("first-look")!;
    expect(shouldAutoStart(firstLook, null, { ...ctx, hasConnection: true })).toBe(true);
    expect(shouldAutoStart(firstLook, null, ctx)).toBe(false);
    expect(
      shouldAutoStart(firstLook, null, {
        ...ctx,
        pathname: "/acme/inbox",
        hasConnection: true,
      }),
    ).toBe(false);
  });

  it("starts feature tours on their first page visit", () => {
    const inbox = getTour("inbox")!;
    expect(
      shouldAutoStart(inbox, null, { pathname: "/acme/inbox", orgSlug: "acme", hasConnection: true }),
    ).toBe(true);
    expect(shouldAutoStart(inbox, null, ctx)).toBe(false);
  });

  it("never again after it was started, completed or skipped", () => {
    for (const status of ["started", "completed", "skipped"] as const) {
      expect(shouldAutoStart(welcome, { version: "1.0.0", status }, ctx)).toBe(false);
    }
  });

  it("runs again once for a higher major version (What's new), not for minor bumps", () => {
    expect(isNewerMajor("2.0.0", "1.4.0")).toBe(true);
    expect(isNewerMajor("1.5.0", "1.0.0")).toBe(false);
    expect(
      shouldAutoStart(
        { ...welcome, version: "2.0.0" },
        { version: "1.0.0", status: "skipped" },
        ctx,
      ),
    ).toBe(true);
    expect(
      shouldAutoStart(
        { ...welcome, version: "1.9.0" },
        { version: "1.0.0", status: "skipped" },
        ctx,
      ),
    ).toBe(false);
  });

  it("manual tours never start on their own", () => {
    expect(shouldAutoStart({ ...welcome, trigger: "manual" }, null, ctx)).toBe(false);
  });
});

describe("state DTO", () => {
  it("keeps the completion check after a replay and flags outdated versions", () => {
    const replayed = toStateDTO(welcome, can("owner"), {
      version: "1.0.0",
      status: "started",
      lastStep: 0,
      completedAt: new Date(),
    });
    expect(replayed).toMatchObject({ status: "started", completed: true, outdated: false });
    const old = toStateDTO({ ...welcome, version: "2.0.0" }, can("owner"), {
      version: "1.0.0",
      status: "skipped",
      lastStep: 2,
    });
    expect(old).toMatchObject({ outdated: true, completed: false, lastStep: 2 });
  });
});

describe("buildTour (per member, per viewport)", () => {
  const state = toStateDTO(welcome, can("owner"), null);
  const has = (...present: string[]) => ({
    pathname: "/acme",
    desktop: true,
    exists: (selector: string) => present.some((p) => selector.includes(p)),
  });

  it("chains routes with nextRoute and prevRoute and carries the Wizi mood", () => {
    const tour = buildTour("acme", state, has("nav", "connect-card", "help"))!;
    expect(tour.steps).toHaveLength(7);
    const at = (i: number) => tour.steps[i]!;
    expect(at(3).id).toBe("help");
    expect(at(3).nextRoute).toBe("/acme/settings/connections");
    expect(at(4).prevRoute).toBe("/acme");
    expect(at(4).nextRoute).toBe("/acme/inbox");
    expect(at(5).nextRoute).toBe("/acme/compose");
    expect(at(0).nextRoute).toBeUndefined();
    expect(at(5).icon).toBe("wow");
    expect(at(6).icon).toBe("happy");
  });

  it("targets the menu button instead of the sidebar on small screens", () => {
    const tour = buildTour("acme", state, {
      ...has("nav", "connect-card", "help"),
      desktop: false,
    })!;
    expect(tour.steps[1]!.selector).toBe('[data-tour="nav-button"]');
  });

  it("drops a step on the current page whose target is missing (e.g. already connected)", () => {
    const tour = buildTour("acme", state, has("nav", "help"))!;
    expect(tour.steps.map((s) => s.title)).not.toContain("Start with a Resend account");
    expect(tour.steps).toHaveLength(6);
  });

  it("returns nothing when fewer than two steps remain", () => {
    const viewer = toStateDTO(welcome, can("viewer"), null);
    expect(buildTour("acme", { ...viewer, stepIds: ["hello"], steps: [] }, has())).toBeNull();
    expect(buildTour("acme", { ...state, id: "nope", steps: [] }, has())).toBeNull();
  });
});
