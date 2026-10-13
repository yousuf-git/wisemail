import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api-base";
import { createLiveConnection, notificationsTopic } from "@/lib/realtime";

/**
 * Opens `/api/stream?orgSlug=` (absolute when `VITE_API_URL` is set) and invalidates
 * notification queries when the member's notification topic fires (or on stream resync).
 */
export function useOrgStream(orgSlug: string, userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const conn = createLiveConnection(
      apiUrl(`/api/stream?orgSlug=${encodeURIComponent(orgSlug)}`),
    );
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
