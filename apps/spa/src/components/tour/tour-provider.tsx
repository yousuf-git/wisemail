import { useRouter, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";

import type { TourBootstrapDTO } from "@/lib/tours/types";
import { TOUR_START_EVENT, TourContext } from "./tour-context";

const TourRunner = lazy(() =>
  import("./tour-runner").then((m) => ({ default: m.TourRunner })),
);

/**
 * Mounted in the org layout. Holds bootstrap progress and lets the Help menu start a tour;
 * the runner loads lazily so org pages do not pay for it until needed.
 */
export function TourProvider({
  orgSlug,
  bootstrap,
  children,
}: {
  orgSlug: string;
  bootstrap: TourBootstrapDTO;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState<{ tourId: string; nonce: number } | null>(null);
  const [running, setRunning] = useState(false);
  const nonce = useRef(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();

  const start = useCallback((tourId: string) => {
    window.dispatchEvent(new Event(TOUR_START_EVENT));
    nonce.current += 1;
    setPending({ tourId, nonce: nonce.current });
  }, []);

  const api = useMemo(
    () => ({ tours: bootstrap.tours, start, running }),
    [bootstrap.tours, start, running],
  );

  return (
    <TourContext.Provider value={api}>
      {children}
      <Suspense fallback={null}>
        <TourRunner
          orgSlug={orgSlug}
          bootstrap={bootstrap}
          request={pending}
          onRequestHandled={() => setPending(null)}
          pathname={pathname}
          navigate={(path) => {
            const clean = path.split("?")[0] ?? path;
            void router.navigate({ to: clean });
          }}
          onRunningChange={setRunning}
        />
      </Suspense>
    </TourContext.Provider>
  );
}
