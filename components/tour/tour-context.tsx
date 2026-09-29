"use client";

import { createContext, useContext } from "react";

import type { TourStateDTO } from "@/lib/tours/types";

/** Fired on `window` when a tour is about to start, so open sheets can close. */
export const TOUR_START_EVENT = "wisemail:tour-start";

export type TourApi = {
  /** Tours available to this member, with progress. */
  tours: TourStateDTO[];
  /** Starts a tour from its first step (replay), navigating there first when needed. */
  start: (tourId: string) => void;
  /** A tour is on screen right now. */
  running: boolean;
};

export const TourContext = createContext<TourApi | null>(null);

/** Null outside the app shell (marketing and auth pages have no tours). */
export const useTours = () => useContext(TourContext);
