"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Human labels for breadcrumb segments that are ids (a thread, an email, an incident, a domain).
 * The top bar sits beside the page, not above it, so a page cannot pass props to it; instead the
 * page renders `<BreadcrumbLabel segment={id} label="Invoice question" />` and the top bar looks
 * the segment up here. Labels are keyed by the segment value, so a stale entry can never label
 * another page.
 */

type Labels = Record<string, string>;
type Store = { labels: Labels; set: (segment: string, label: string) => void };

const BreadcrumbContext = createContext<Store | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<Labels>({});
  const set = useCallback((segment: string, label: string) => {
    setLabels((current) =>
      current[segment] === label ? current : { ...current, [segment]: label },
    );
  }, []);
  const value = useMemo(() => ({ labels, set }), [labels, set]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/** The registered label for a path segment, if any. */
export function useBreadcrumbLabel(segment: string): string | undefined {
  return useContext(BreadcrumbContext)?.labels[segment];
}

/** Registers `label` for `segment` while mounted. Renders nothing. */
export function BreadcrumbLabel({ segment, label }: { segment: string; label: string }) {
  const store = useContext(BreadcrumbContext);
  const set = store?.set;
  useEffect(() => {
    if (label.trim()) set?.(segment, label.trim());
  }, [set, segment, label]);
  return null;
}

/** Ids the app puts in URLs: Mongo ObjectIds (24 hex). Never shown raw in a breadcrumb. */
export const looksLikeId = (segment: string) => /^[0-9a-f]{24}$/i.test(segment);
