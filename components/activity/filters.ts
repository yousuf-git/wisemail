import type { ActivityFilterState } from "@/components/inbox/api";
import { EMPTY_ACTIVITY_FILTERS } from "@/components/inbox/api";

const KEYS = Object.keys(EMPTY_ACTIVITY_FILTERS) as (keyof ActivityFilterState)[];

/** Filters from the page URL (`?status=bounced,failed&direction=outbound&q=...`). */
export function filtersFromSearch(
  search: Record<string, string | string[] | undefined>,
): ActivityFilterState {
  const next = { ...EMPTY_ACTIVITY_FILTERS };
  for (const key of KEYS) {
    const raw = search[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) next[key] = value.slice(0, 200);
  }
  return next;
}

/** Query string for the page URL; empty filters are left out. */
export function filtersToSearch(filters: ActivityFilterState): string {
  const params = new URLSearchParams();
  for (const key of KEYS) if (filters[key]) params.set(key, filters[key]);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const hasActiveFilters = (filters: ActivityFilterState) => KEYS.some((k) => !!filters[k]);
