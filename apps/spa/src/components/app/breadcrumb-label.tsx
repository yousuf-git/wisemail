import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Human labels for breadcrumb segments that are ids. Pages render
 * `<BreadcrumbLabel segment={id} label="…" />`; the top bar looks them up here.
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

export function useBreadcrumbLabel(segment: string): string | undefined {
  return useContext(BreadcrumbContext)?.labels[segment];
}

export function BreadcrumbLabel({ segment, label }: { segment: string; label: string }) {
  const store = useContext(BreadcrumbContext);
  const set = store?.set;
  useEffect(() => {
    if (label.trim()) set?.(segment, label.trim());
  }, [set, segment, label]);
  return null;
}

/** Mongo ObjectIds (24 hex) — never shown raw in a breadcrumb. */
export const looksLikeId = (segment: string) => /^[0-9a-f]{24}$/i.test(segment);
