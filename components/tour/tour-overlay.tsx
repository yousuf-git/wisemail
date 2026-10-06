"use client";

import { NextStepProvider, useNextStep } from "nextstepjs";
import { useEffect } from "react";

import type { TourBootstrapDTO } from "@/lib/tours/types";
import { TourRunner } from "./tour-runner";

/**
 * Heavy nextstepjs surface. Loaded only from `TourProvider` via `next/dynamic` so org pages do
 * not pay for the tour library until after hydration.
 */
export function TourOverlay({
  orgSlug,
  bootstrap,
  request,
  onRequestHandled,
  pathname,
  navigate,
  onRunningChange,
}: {
  orgSlug: string;
  bootstrap: TourBootstrapDTO;
  request: { tourId: string; nonce: number } | null;
  onRequestHandled: () => void;
  pathname: string;
  navigate: (path: string) => void;
  onRunningChange: (running: boolean) => void;
}) {
  return (
    <NextStepProvider>
      <RunningBridge onRunningChange={onRunningChange} />
      <TourRunner
        orgSlug={orgSlug}
        bootstrap={bootstrap}
        request={request}
        onRequestHandled={onRequestHandled}
        pathname={pathname}
        navigate={navigate}
      />
    </NextStepProvider>
  );
}

function RunningBridge({ onRunningChange }: { onRunningChange: (running: boolean) => void }) {
  const { isNextStepVisible } = useNextStep();
  useEffect(() => {
    onRunningChange(isNextStepVisible);
  }, [isNextStepVisible, onRunningChange]);
  return null;
}
