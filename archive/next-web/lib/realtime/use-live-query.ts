"use client";

import {
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useLiveStatus, useLiveTopics } from "./live-context";

/** Safety net while the stream is up (a missed event heals within a minute)... */
export const LIVE_FALLBACK_MS = 60_000;
/** ...and the poll used while it is down. */
export const OFFLINE_FALLBACK_MS = 15_000;

/**
 * `useQuery` that refetches when a realtime event for one of `topics` arrives (TRD §2.6). A slow
 * fallback refetch stays on unless the caller sets its own `refetchInterval`. Outside a
 * `LiveProvider` it behaves like plain `useQuery` with no polling.
 */
export function useLiveQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
    queryKey: TQueryKey;
    topics: readonly string[];
  },
): UseQueryResult<TData, TError> {
  const { topics, ...queryOptions } = options;
  const queryClient = useQueryClient();
  const status = useLiveStatus();

  useLiveTopics(topics, () => {
    void queryClient.invalidateQueries({ queryKey: options.queryKey });
  });

  const fallback =
    status === null ? false : status === "live" ? LIVE_FALLBACK_MS : OFFLINE_FALLBACK_MS;
  return useQuery({
    ...queryOptions,
    refetchInterval: queryOptions.refetchInterval ?? fallback,
  } as UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>);
}

/** Fallback interval for hand-written queries that only use `useLiveTopics`. */
export function useLiveFallbackInterval(): number | false {
  const status = useLiveStatus();
  return status === null ? false : status === "live" ? LIVE_FALLBACK_MS : OFFLINE_FALLBACK_MS;
}
