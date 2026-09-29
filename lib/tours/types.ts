import type { WiziMood } from "@/components/mascot/moods";
import type { Permission } from "@/lib/auth/permissions";

/** How a tour is offered (TRD §2.11). `manual` tours only run from the Help menu. */
export type TourTrigger =
  "auto_first_visit" | "auto_after_event" | "auto_first_page_visit" | "manual";

export type TourSide = "top" | "bottom" | "left" | "right";

export type TourStepDef = {
  id: string;
  /** Path below `/<orgSlug>`; the empty string is the overview. */
  route: string;
  /** `[data-tour="…"]` selector (never CSS classes). Omit for a centered card. */
  selector?: string;
  /** Used instead of `selector` below 1000 px, where the sidebar is a sheet. */
  mobileSelector?: string;
  title: string;
  /** One idea, two sentences at most, in Wizi's partner voice. */
  body: string;
  mood: WiziMood;
  side?: TourSide;
  /** The step is left out for members without this permission. */
  requires?: Permission;
};

export type TourDefinition = {
  id: string;
  /** Semver. A higher major version makes the tour eligible again ("What's new"). */
  version: string;
  name: string;
  description: string;
  trigger: TourTrigger;
  /** For `auto_first_visit`: the page (below the org) where it starts. */
  autoRoute?: string;
  /** Members who lack any of these permissions never get the tour. */
  audience?: { requires?: Permission[] };
  steps: TourStepDef[];
  /** After the last step, an org without a connection lands on the Connect dialog. */
  endsWithConnect?: boolean;
};

export type TourStatus = "started" | "completed" | "skipped";

/** What the client knows about one tour for this member: progress and which steps apply. */
export type TourStateDTO = {
  id: string;
  name: string;
  description: string;
  version: string;
  trigger: TourTrigger;
  /** Steps this member sees (role and plan filtered), by id, in order. */
  stepIds: string[];
  status: TourStatus | null;
  /** Ever completed, even if replayed since. */
  completed: boolean;
  lastStep: number;
  /** True when a new major version should run once for this member. */
  outdated: boolean;
};

export type TourBootstrapDTO = {
  tours: TourStateDTO[];
  hasConnection: boolean;
};
