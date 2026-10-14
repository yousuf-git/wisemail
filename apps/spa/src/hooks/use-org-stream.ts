import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api-base";
import { createLiveConnection, notificationsTopic } from "@/lib/realtime";

/**
 * Opens `/api/stream?orgSlug=` and invalidates React Query caches when matching
 * topics fire (or on stream resync). One connection per org layout.
 */
export function useOrgStream(orgSlug: string, userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const conn = createLiveConnection(
      apiUrl(`/api/stream?orgSlug=${encodeURIComponent(orgSlug)}`),
    );

    const invalidate = (...keys: string[][]) => {
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    };

    const unsubNotify = conn.subscribe([notificationsTopic(userId)], () => {
      invalidate(["notifications", orgSlug]);
    });
    const unsubEmails = conn.subscribe(["emails"], () => {
      invalidate(["overview", orgSlug], ["insights", orgSlug], ["threads", orgSlug], [
        "activity",
        orgSlug,
      ]);
    });
    const unsubThreads = conn.subscribe(["threads"], () => {
      invalidate(["threads", orgSlug]);
    });
    const unsubIncidents = conn.subscribe(["incidents"], () => {
      invalidate(["incidents", orgSlug], ["alerts", orgSlug]);
    });
    const unsubConnections = conn.subscribe(["connections"], () => {
      invalidate(["overview", orgSlug], ["connections", orgSlug]);
    });
    const unsubUsage = conn.subscribe(["usage"], () => {
      invalidate(["usage-summary", orgSlug], ["usage", orgSlug]);
    });

    // Resync: any listener with empty topic match on `all` — subscribe with a wildcard via
    // a dedicated handler that always runs on resync (createLiveConnection calls all listeners).
    const unsubResync = conn.subscribe([], () => {
      /* no-op topic match; resync path invokes every listener */
      invalidate(
        ["notifications", orgSlug],
        ["overview", orgSlug],
        ["threads", orgSlug],
        ["insights", orgSlug],
      );
    });

    conn.start();
    return () => {
      unsubNotify();
      unsubEmails();
      unsubThreads();
      unsubIncidents();
      unsubConnections();
      unsubUsage();
      unsubResync();
      conn.stop();
    };
  }, [orgSlug, userId, queryClient]);
}
