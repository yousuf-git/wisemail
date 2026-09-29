"use client";

import { MotionConfig, useReducedMotion } from "motion/react";
import { NextStep, useNextStep, type Tour } from "nextstepjs";
import { useCallback, useEffect, useRef, useState } from "react";

import { recordTourEventAction } from "@/app/(app)/[orgSlug]/tour-actions";
import { getTour, shouldAutoStart, type TourStateDTO, type TourStepDef } from "@/lib/tours";
import type { TourBootstrapDTO } from "@/lib/tours/types";
import { TourCard } from "./tour-card";

/** Auto tours never start during the first seconds of a page load (TRD §2.11). */
const AUTO_DELAY_MS = 2000;
const RETRY_MS = 1000;
const MAX_RETRIES = 30;
const DESKTOP = "(min-width: 1000px)";

/** A dialog, sheet or the composer is open: an auto tour waits (UC-34 alt C). */
function somethingIsOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"]:not([data-testid="tour-card"]), [role="alertdialog"], [data-tour="composer"]',
  );
}

const desktop = () => window.matchMedia(DESKTOP).matches;

const visible = (el: Element | null): boolean => {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

/**
 * The member's version of a tour as a NextStepjs tour: steps they can't see are gone, the sidebar
 * step targets the menu button on small screens, cross-page steps carry `nextRoute` / `prevRoute`,
 * and a step on the current page whose target is missing (e.g. the connect card once connected)
 * is dropped. Fewer than two steps left: no tour.
 */
export function buildTour(
  orgSlug: string,
  state: TourStateDTO,
  options: { pathname: string; desktop: boolean; exists: (selector: string) => boolean },
): Tour | null {
  const def = getTour(state.id);
  if (!def) return null;
  const path = (route: string) => `/${orgSlug}${route ? `/${route}` : ""}`;
  const allowed = new Set(state.stepIds);
  const steps: TourStepDef[] = def.steps.filter((s) => allowed.has(s.id));
  const selectorOf = (s: TourStepDef) =>
    options.desktop ? s.selector : (s.mobileSelector ?? s.selector);
  const kept = steps.filter((s) => {
    const selector = selectorOf(s);
    if (!selector) return true;
    return path(s.route) !== options.pathname || options.exists(selector);
  });
  if (kept.length < 2) return null;
  return {
    tour: def.id,
    steps: kept.map((s, i) => {
      const prev = kept[i - 1];
      const next = kept[i + 1];
      return {
        icon: s.mood,
        title: s.title,
        content: s.body,
        selector: selectorOf(s),
        side: s.side,
        // A centered card has no target: no spotlight hole either.
        pointerPadding: selectorOf(s) ? 6 : 0,
        pointerRadius: 14,
        cardOffset: 16,
        selectorRetryAttempts: 15,
        selectorRetryDelay: 200,
        nextRoute: next && next.route !== s.route ? path(next.route) : undefined,
        prevRoute: prev && prev.route !== s.route ? path(prev.route) : undefined,
      };
    }),
  };
}

/**
 * Runs product tours (TRD §2.11): builds the member's tours, starts an eligible one on its own
 * (first visit, after 2 s, when nothing is open, at most one per page view), starts replays from
 * the menus, and saves progress (start, step, complete, skip) through a server action.
 */
export function TourRunner({
  orgSlug,
  bootstrap,
  request,
  onRequestHandled,
  pathname,
  navigate,
}: {
  orgSlug: string;
  bootstrap: TourBootstrapDTO;
  request: { tourId: string; nonce: number } | null;
  onRequestHandled: () => void;
  pathname: string;
  navigate: (path: string) => void;
}) {
  const { startNextStep, closeNextStep, isNextStepVisible } = useNextStep();
  const reduced = useReducedMotion();
  const trigger = useRef<"auto" | "manual">("auto");
  const autoTried = useRef<string | null>(null);
  const started = useRef<string | null>(null);

  // NextStepjs reads its tours from props: one entry per tour, filled in when it starts (the
  // steps depend on the viewport, the member's role and what is on the page).
  const [tours, setTours] = useState<Tour[]>(() =>
    bootstrap.tours.map((t) => ({ tour: t.id, steps: [] })),
  );

  const save = useCallback(
    (tourId: string, event: "start" | "step" | "complete" | "skip", step?: number) => {
      void recordTourEventAction(orgSlug, { tourId, event, step, trigger: trigger.current });
    },
    [orgSlug],
  );

  const begin = useCallback(
    (state: TourStateDTO, why: "auto" | "manual") => {
      const tour = buildTour(orgSlug, state, {
        pathname: window.location.pathname,
        desktop: desktop(),
        exists: (selector) => visible(document.querySelector(selector)),
      });
      if (!tour) return false;
      trigger.current = why;
      setTours((current) => [...current.filter((t) => t.tour !== state.id), tour]);
      startNextStep(state.id);
      return true;
    },
    [orgSlug, startNextStep],
  );

  // Replays from the Help menu / user menu. Go to the first step's page first. The wait for the
  // page lives in a ref, not in the effect's cleanup: handling the request clears it, which
  // re-runs the effect.
  const waiting = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => void (waiting.current && clearInterval(waiting.current)), []);
  useEffect(() => {
    if (!request) return;
    const state = bootstrap.tours.find((t) => t.id === request.tourId);
    const def = getTour(request.tourId);
    onRequestHandled();
    if (waiting.current) clearInterval(waiting.current);
    if (!state || !def) return;
    const first = def.steps.find((s) => state.stepIds.includes(s.id));
    if (!first) return;
    if (isNextStepVisible) closeNextStep();
    const target = `/${orgSlug}${first.route ? `/${first.route}` : ""}`;
    const selector = () => (desktop() ? first.selector : (first.mobileSelector ?? first.selector));
    const go = () => begin(state, "manual");
    if (window.location.pathname === target) {
      go();
      return;
    }
    navigate(target);
    let tries = 0;
    waiting.current = setInterval(() => {
      tries += 1;
      const wanted = selector();
      const ready =
        window.location.pathname === target && (!wanted || visible(document.querySelector(wanted)));
      if (ready || tries > 25) {
        if (waiting.current) clearInterval(waiting.current);
        waiting.current = null;
        go();
      }
    }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // Automatic start: first visit, 2 s after load, nothing open, once per page view.
  useEffect(() => {
    if (isNextStepVisible || autoTried.current === pathname) return;
    const candidate = bootstrap.tours.find((state) => {
      const def = getTour(state.id);
      if (!def) return false;
      return shouldAutoStart(
        def,
        state.status
          ? { version: state.outdated ? "0.0.0" : state.version, status: state.status }
          : null,
        { pathname, orgSlug, hasConnection: bootstrap.hasConnection },
      );
    });
    if (!candidate) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      tries += 1;
      if (window.location.pathname !== pathname) return;
      if (somethingIsOpen()) {
        if (tries < MAX_RETRIES) timer = setTimeout(attempt, RETRY_MS);
        return;
      }
      autoTried.current = pathname;
      begin(candidate, "auto");
    };
    timer = setTimeout(attempt, AUTO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, bootstrap, orgSlug, isNextStepVisible, begin]);

  const hasConnection = bootstrap.hasConnection;
  const onStart = useCallback(
    (tourId: string | null) => {
      // NextStepjs calls this once per start; the guard keeps a re-render from saving twice.
      if (!tourId || started.current === tourId) return;
      started.current = tourId;
      save(tourId, "start");
    },
    [save],
  );
  const onStepChange = useCallback(
    (step: number, tourId: string | null) => {
      if (tourId) save(tourId, "step", step);
    },
    [save],
  );
  const onComplete = useCallback(
    (tourId: string | null) => {
      started.current = null;
      if (!tourId) return;
      const def = getTour(tourId);
      save(tourId, "complete", (def?.steps.length ?? 1) - 1);
      if (def?.endsWithConnect && !hasConnection) {
        navigate(`/${orgSlug}/settings/connections?connect=1`);
      }
    },
    [save, hasConnection, navigate, orgSlug],
  );
  const onSkip = useCallback(
    (step: number, tourId: string | null) => {
      started.current = null;
      if (tourId) save(tourId, "skip", step);
    },
    [save],
  );

  return (
    <MotionConfig reducedMotion="user">
      <NextStep
        steps={tours}
        cardComponent={TourCard}
        cardTransition={reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 30 }}
        shadowRgb="31, 30, 28"
        shadowOpacity="0.55"
        arrowStyle={{ color: "var(--surface)", filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.12))" }}
        disableConsoleLogs
        scrollToTop={false}
        onStart={onStart}
        onStepChange={onStepChange}
        onComplete={onComplete}
        onSkip={onSkip}
      >
        {null}
      </NextStep>
    </MotionConfig>
  );
}
