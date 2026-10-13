import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createLiveConnection, notificationsTopic } from "@/lib/realtime";

/**
 * Opens `/api/stream?orgSlug=` and invalidates notification queries when the
 * member's notification topic fires (or on stream resync).
 */
export function useOrgStream(orgSlug: string, userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const conn = createLiveConnection(`/api/stream?orgSlug=${encodeURIComponent(orgSlug)}`);
    const unsub = conn.subscribe([notificationsTopic(userId)], () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", orgSlug] });
    });
    conn.start();
    return () => {
      unsub();
      conn.stop();
    };
  }, [orgSlug, userId, queryClient]);
}
