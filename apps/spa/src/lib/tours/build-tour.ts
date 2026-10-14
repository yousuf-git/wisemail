import type { BuiltTour, TourStateDTO, TourStepClientDTO } from "./types";

const MIN_STEPS = 2;

/**
 * Filter tour steps for the member + viewport, then chain next/prev routes.
 * Uses steps embedded in the bootstrap DTO (no server tour module import).
 */
export function buildTour(
  orgSlug: string,
  state: TourStateDTO,
  options: { pathname: string; desktop: boolean; exists: (selector: string) => boolean },
): BuiltTour | null {
  const path = (route: string) => `/${orgSlug}${route ? `/${route}` : ""}`;
  const selectorOf = (s: TourStepClientDTO) =>
    options.desktop ? s.selector : (s.mobileSelector ?? s.selector);
  const kept = state.steps.filter((s) => {
    const selector = selectorOf(s);
    if (!selector) return true;
    return path(s.route) !== options.pathname || options.exists(selector);
  });
  if (kept.length < MIN_STEPS) return null;
  return {
    tour: state.id,
    endsWithConnect: state.endsWithConnect,
    steps: kept.map((s, i) => {
      const prev = kept[i - 1];
      const next = kept[i + 1];
      return {
        id: s.id,
        icon: s.mood,
        title: s.title,
        content: s.body,
        route: s.route,
        selector: selectorOf(s),
        side: s.side,
        nextRoute: next && next.route !== s.route ? path(next.route) : undefined,
        prevRoute: prev && prev.route !== s.route ? path(prev.route) : undefined,
      };
    }),
  };
}

/** May this tour start on its own? Mirrors server `shouldAutoStart`. */
export function shouldAutoStart(
  state: TourStateDTO,
  context: { pathname: string; orgSlug: string; hasConnection: boolean },
): boolean {
  if (state.trigger === "manual") return false;
  if (state.status && !state.outdated) return false;
  if (state.trigger === "auto_first_visit") {
    const target = `/${context.orgSlug}${state.autoRoute ? `/${state.autoRoute}` : ""}`;
    return context.pathname === target && !context.hasConnection;
  }
  return false;
}
