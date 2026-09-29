"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { createLiveConnection, type LiveConnection, type LiveStatus } from "./live-connection";

const LiveContext = createContext<LiveConnection | null>(null);

/** One shared EventSource for the tab (FED §9.3 live dot reads its status). */
export function LiveProvider({
  orgSlug,
  children,
}: {
  orgSlug: string;
  children: React.ReactNode;
}) {
  const connection = useMemo(
    () => createLiveConnection({ url: `/api/stream?orgSlug=${encodeURIComponent(orgSlug)}` }),
    [orgSlug],
  );
  useEffect(() => {
    connection.start();
    return () => connection.stop();
  }, [connection]);
  return <LiveContext.Provider value={connection}>{children}</LiveContext.Provider>;
}

/** Stream status; `null` when there is no provider (tests, pages outside the org shell). */
export function useLiveStatus(): LiveStatus | null {
  const connection = useContext(LiveContext);
  return useSyncExternalStore(
    (cb) => connection?.onStatus(cb) ?? (() => {}),
    () => connection?.getStatus() ?? null,
    () => (connection ? "connecting" : null),
  );
}

/** Calls `onEvent` (batched, ~100 ms) when an event for any of `topics` arrives, or on resync. */
export function useLiveTopics(topics: readonly string[], onEvent: (matched: string[]) => void) {
  const connection = useContext(LiveContext);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const key = topics.join("\n");
  useEffect(() => {
    if (!connection) return;
    return connection.subscribe(key ? key.split("\n") : [], (matched) => handler.current(matched));
  }, [connection, key]);
}
