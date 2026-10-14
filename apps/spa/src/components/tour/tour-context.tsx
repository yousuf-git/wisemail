import { createContext, useContext } from "react";

import type { TourStateDTO } from "@/lib/tours/types";

/** Fired on `window` when a tour is about to start, so open sheets can close. */
export const TOUR_START_EVENT = "wisemail:tour-start";

export type TourApi = {
  tours: TourStateDTO[];
  start: (tourId: string) => void;
  running: boolean;
};

export const TourContext = createContext<TourApi | null>(null);

export const useTours = () => useContext(TourContext);
