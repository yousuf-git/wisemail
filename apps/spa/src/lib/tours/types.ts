import type { WiziMood } from "@/components/mascot/moods";

export type TourTrigger =
  | "auto_first_visit"
  | "auto_after_event"
  | "auto_first_page_visit"
  | "manual";

export type TourSide = "top" | "bottom" | "left" | "right";

export type TourStepClientDTO = {
  id: string;
  route: string;
  selector?: string;
  mobileSelector?: string;
  title: string;
  body: string;
  mood: WiziMood;
  side?: TourSide;
};

export type TourStatus = "started" | "completed" | "skipped";

export type TourStateDTO = {
  id: string;
  name: string;
  description: string;
  version: string;
  trigger: TourTrigger;
  stepIds: string[];
  steps: TourStepClientDTO[];
  autoRoute?: string;
  endsWithConnect?: boolean;
  status: TourStatus | null;
  completed: boolean;
  lastStep: number;
  outdated: boolean;
};

export type TourBootstrapDTO = {
  tours: TourStateDTO[];
  hasConnection: boolean;
};

export type BuiltTourStep = {
  id: string;
  icon: string;
  title: string;
  content: string;
  route: string;
  selector?: string;
  side?: TourSide;
  nextRoute?: string;
  prevRoute?: string;
};

export type BuiltTour = { tour: string; endsWithConnect?: boolean; steps: BuiltTourStep[] };
