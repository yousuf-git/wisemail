import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { recordTourEvent } from "@/lib/actions";
import { buildTour, shouldAutoStart } from "@/lib/tours/build-tour";
import type { BuiltTour, BuiltTourStep, TourBootstrapDTO, TourStateDTO } from "@/lib/tours/types";
import { TourCard } from "./tour-card";

const AUTO_DELAY_MS = 2000;
const RETRY_MS = 1000;
const MAX_RETRIES = 30;
const DESKTOP = "(min-width: 1000px)";

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

function Spotlight({
  step,
  card,
}: {
  step: BuiltTourStep;
  card: React.ReactNode;
}) {
  const [hole, setHole] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const el = step.selector ? document.querySelector(step.selector) : null;
      const rect = el && visible(el) ? el.getBoundingClientRect() : null;
      setHole(rect);
      if (!rect) {
        setCardPos({
          top: Math.max(24, window.innerHeight / 2 - 120),
          left: Math.max(16, window.innerWidth / 2 - 180),
        });
        return;
      }
      const pad = 12;
      const cardW = Math.min(360, window.innerWidth - 32);
      let top = rect.bottom + pad;
      let left = rect.left;
      if (step.side === "top") top = rect.top - pad - 200;
      if (step.side === "left") {
        top = rect.top;
        left = rect.left - cardW - pad;
      }
      if (step.side === "right") {
        top = rect.top;
        left = rect.right + pad;
      }
      if (top + 220 > window.innerHeight) top = Math.max(16, rect.top - 220);
      if (left + cardW > window.innerWidth - 16) left = window.innerWidth - cardW - 16;
      if (left < 16) left = 16;
      if (top < 16) top = 16;
      setCardPos({ top, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  const pad = 6;
  const r = hole
    ? {
        top: hole.top - pad,
        left: hole.left - pad,
        width: hole.width + pad * 2,
        height: hole.height + pad * 2,
      }
    : null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[900]" data-testid="tour-spotlight">
      <div
        className="absolute inset-0 bg-[rgb(31_30_28/0.55)]"
        style={
          r
            ? {
                clipPath: `polygon(0% 0%, 0% 100%, ${r.left}px 100%, ${r.left}px ${r.top}px, ${r.left + r.width}px ${r.top}px, ${r.left + r.width}px ${r.top + r.height}px, ${r.left}px ${r.top + r.height}px, ${r.left}px 100%, 100% 100%, 100% 0%)`,
              }
            : undefined
        }
      />
      {r ? (
        <div
          className="absolute rounded-[14px] ring-2 ring-canvas/80"
          style={{
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
          }}
        />
      ) : null}
      {cardPos ? (
        <div className="pointer-events-auto absolute" style={{ top: cardPos.top, left: cardPos.left }}>
          {card}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export function TourRunner({
  orgSlug,
  bootstrap,
  request,
  onRequestHandled,
  pathname,
  navigate,
  onRunningChange,
}: {
  orgSlug: string;
  bootstrap: TourBootstrapDTO;
  request: { tourId: string; nonce: number } | null;
  onRequestHandled: () => void;
  pathname: string;
  navigate: (path: string) => void;
  onRunningChange: (running: boolean) => void;
}) {
  const trigger = useRef<"auto" | "manual">("auto");
  const autoTried = useRef<string | null>(null);
  const started = useRef<string | null>(null);
  const [active, setActive] = useState<{ tour: BuiltTour; index: number } | null>(null);

  const save = useCallback(
    (tourId: string, event: "start" | "step" | "complete" | "skip", step?: number) => {
      void recordTourEvent(orgSlug, { tourId, event, step, trigger: trigger.current });
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
      if (started.current !== state.id) {
        started.current = state.id;
        save(state.id, "start");
      }
      setActive({ tour, index: 0 });
      onRunningChange(true);
      return true;
    },
    [orgSlug, save, onRunningChange],
  );

  const close = useCallback(() => {
    setActive(null);
    started.current = null;
    onRunningChange(false);
  }, [onRunningChange]);

  const waiting = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => void (waiting.current && clearInterval(waiting.current)), []);

  useEffect(() => {
    if (!request) return;
    const state = bootstrap.tours.find((t) => t.id === request.tourId);
    onRequestHandled();
    if (waiting.current) clearInterval(waiting.current);
    if (!state || state.steps.length === 0) return;
    const first = state.steps[0]!;
    if (active) close();
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

  useEffect(() => {
    if (active || autoTried.current === pathname) return;
    const candidate = bootstrap.tours.find((state) =>
      shouldAutoStart(state, {
        pathname,
        orgSlug,
        hasConnection: bootstrap.hasConnection,
      }),
    );
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
  }, [pathname, bootstrap, orgSlug, active, begin]);

  const goToIndex = useCallback(
    (tour: BuiltTour, index: number) => {
      const step = tour.steps[index];
      if (!step) return;
      const target = `/${orgSlug}${step.route ? `/${step.route}` : ""}`;
      const apply = () => {
        setActive({ tour, index });
        save(tour.tour, "step", index);
      };
      if (window.location.pathname === target) {
        apply();
        return;
      }
      navigate(target);
      let tries = 0;
      if (waiting.current) clearInterval(waiting.current);
      waiting.current = setInterval(() => {
        tries += 1;
        const ready =
          window.location.pathname === target &&
          (!step.selector || visible(document.querySelector(step.selector)));
        if (ready || tries > 25) {
          if (waiting.current) clearInterval(waiting.current);
          waiting.current = null;
          apply();
        }
      }, 200);
    },
    [navigate, orgSlug, save],
  );

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        save(active.tour.tour, "skip", active.index);
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (active.index >= active.tour.steps.length - 1) {
          save(active.tour.tour, "complete", active.index);
          const ends = active.tour.endsWithConnect && !bootstrap.hasConnection;
          close();
          if (ends) navigate(`/${orgSlug}/settings/connections?connect=1`);
        } else {
          goToIndex(active.tour, active.index + 1);
        }
      } else if (e.key === "ArrowLeft" && active.index > 0) {
        e.preventDefault();
        goToIndex(active.tour, active.index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, bootstrap.hasConnection, close, goToIndex, navigate, orgSlug, save]);

  if (!active) return null;
  const step = active.tour.steps[active.index]!;
  const last = active.index === active.tour.steps.length - 1;

  return (
    <Spotlight
      step={step}
      card={
        <TourCard
          step={step}
          currentStep={active.index}
          totalSteps={active.tour.steps.length}
          nextStep={() => {
            if (last) {
              save(active.tour.tour, "complete", active.index);
              const ends = active.tour.endsWithConnect && !bootstrap.hasConnection;
              close();
              if (ends) navigate(`/${orgSlug}/settings/connections?connect=1`);
              return;
            }
            goToIndex(active.tour, active.index + 1);
          }}
          prevStep={() => {
            if (active.index > 0) goToIndex(active.tour, active.index - 1);
          }}
          skipTour={() => {
            save(active.tour.tour, "skip", active.index);
            close();
          }}
        />
      }
    />
  );
}
