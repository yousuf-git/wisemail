import { getTour, MIN_STEPS } from "./index";
import type { TourStateDTO, TourStepDef } from "./types";

/** NextStepjs-shaped tour step (kept free of the UI runner). */
export type BuiltTourStep = {
  icon: string;
  title: string;
  content: string;
  selector?: string;
  side?: TourStepDef["side"];
  pointerPadding: number;
  pointerRadius: number;
  cardOffset: number;
  selectorRetryAttempts: number;
  selectorRetryDelay: number;
  nextRoute?: string;
  prevRoute?: string;
};

export type BuiltTour = { tour: string; steps: BuiltTourStep[] };

/**
 * Filter tour steps for the member + viewport, then chain next/prev routes.
 * Pure: no DOM, no NextStepjs.
 */
export function buildTour(
  orgSlug: string,
  state: TourStateDTO,
  options: { pathname: string; desktop: boolean; exists: (selector: string) => boolean },
): BuiltTour | null {
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
  if (kept.length < MIN_STEPS) return null;
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
