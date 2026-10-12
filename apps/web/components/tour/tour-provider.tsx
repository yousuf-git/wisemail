"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import type { TourBootstrapDTO } from "@/lib/tours/types";
import { TOUR_START_EVENT, TourContext } from "./tour-context";

// nextstepjs + runner stay off the critical path (TRD §2.11).
const TourOverlay = dynamic(() => import("./tour-overlay").then((m) => m.TourOverlay), {
  ssr: false,
});

/**
 * Mounted in the org layout. Holds what the server knows (progress, the steps this member sees)
 * and lets the Help menu and user menu start a tour; the heavy parts load lazily in `TourOverlay`.
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
  const router = useRouter();
  const pathname = usePathname();

  const start = useCallback((tourId: string) => {
    // Menus that started us (the mobile navigation sheet) close themselves.
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
      <TourOverlay
        orgSlug={orgSlug}
        bootstrap={bootstrap}
        request={pending}
        onRequestHandled={() => setPending(null)}
        pathname={pathname}
        navigate={(path) => router.push(path)}
        onRunningChange={setRunning}
      />
    </TourContext.Provider>
  );
}
