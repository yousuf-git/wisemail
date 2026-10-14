import type { Permission } from "@/lib/auth/permissions";
import type { TourDefinition, TourStateDTO, TourStatus, TourStepDef } from "./types";
import { alertsTour } from "./alerts";
import { broadcastsTour } from "./broadcasts";
import { composerTour } from "./composer";
import { firstLookTour } from "./first-look";
import { inboxTour } from "./inbox";
import { insightsTour } from "./insights";
import { usageBillingTour } from "./usage-billing";
import { welcomeTour } from "./welcome";

export * from "./types";

/** Every tour, in the order the Help menu lists them. */
export const TOURS: readonly TourDefinition[] = [
  welcomeTour,
  firstLookTour,
  inboxTour,
  composerTour,
  insightsTour,
  alertsTour,
  broadcastsTour,
  usageBillingTour,
];

export const getTour = (id: string): TourDefinition | undefined => TOURS.find((t) => t.id === id);

/** Fewer steps than this and a tour does not start (TRD §2.11). */
export const MIN_STEPS = 2;

const major = (version: string) => Number.parseInt(version.split(".")[0] ?? "0", 10) || 0;

/** A higher major version than the one the member saw makes a tour eligible again. */
export const isNewerMajor = (current: string, seen: string) => major(current) > major(seen);

/** Steps this member sees: those whose required permission they hold. */
export function stepsFor(
  def: TourDefinition,
  can: (permission: Permission) => boolean,
): TourStepDef[] {
  return def.steps.filter((step) => !step.requires || can(step.requires));
}

/** The tour is offered to this member at all (audience and at least two steps). */
export function tourAvailable(
  def: TourDefinition,
  can: (permission: Permission) => boolean,
): boolean {
  if (def.audience?.requires?.some((p) => !can(p))) return false;
  return stepsFor(def, can).length >= MIN_STEPS;
}

type Progress = { version: string; status: TourStatus } | null | undefined;

/**
 * May this tour start on its own? Never once it was started, completed or skipped (a skip is
 * final); again only when its major version went up. Manual tours never auto-start.
 */
export function shouldAutoStart(
  def: TourDefinition,
  progress: Progress,
  context: { pathname: string; orgSlug: string; hasConnection: boolean },
): boolean {
  if (def.trigger === "manual") return false;
  if (progress && !isNewerMajor(def.version, progress.version)) return false;
  const target = `/${context.orgSlug}${def.autoRoute ? `/${def.autoRoute}` : ""}`;
  if (def.trigger === "auto_first_visit") {
    return context.pathname === target && !context.hasConnection;
  }
  if (def.trigger === "auto_after_event") {
    // first-look: first connection exists (proxy for initial sync finished).
    return context.pathname === target && context.hasConnection;
  }
  if (def.trigger === "auto_first_page_visit") {
    return context.pathname === target;
  }
  return false;
}

export function toStateDTO(
  def: TourDefinition,
  can: (permission: Permission) => boolean,
  progress:
    | {
        version: string;
        status: TourStatus;
        lastStep: number;
        completedAt?: Date | null;
      }
    | null
    | undefined,
): TourStateDTO {
  const steps = stepsFor(def, can).map((s) => ({
    id: s.id,
    route: s.route,
    selector: s.selector,
    mobileSelector: s.mobileSelector,
    title: s.title,
    body: s.body,
    mood: s.mood,
    side: s.side,
  }));
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    version: def.version,
    trigger: def.trigger,
    stepIds: steps.map((s) => s.id),
    steps,
    autoRoute: def.autoRoute,
    endsWithConnect: def.endsWithConnect,
    status: progress?.status ?? null,
    completed: !!progress?.completedAt || progress?.status === "completed",
    lastStep: progress?.lastStep ?? 0,
    outdated: !!progress && isNewerMajor(def.version, progress.version),
  };
}
