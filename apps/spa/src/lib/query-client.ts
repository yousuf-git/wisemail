import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient (SWR-style dedupe / cache — Vercel `client-swr-dedup`).
 * One instance per app load (`advanced-init-once`).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
