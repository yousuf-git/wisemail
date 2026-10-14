import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { listTime, useNow } from "@/components/inbox/format";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import { listBroadcasts, type BroadcastStatus } from "@/lib/api";

const STATUS_LABEL: Record<BroadcastStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  canceled: "Canceled",
  failed: "Failed",
};

export function BroadcastsPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/broadcasts" });
  const [status, setStatus] = useState("");
  const now = useNow();
  const data = useQuery({
    queryKey: ["broadcasts", orgSlug],
    queryFn: () => listBroadcasts(orgSlug),
  });

  const rows = useMemo(() => {
    const list = data.data?.broadcasts ?? [];
    return status ? list.filter((b) => b.status === status) : list;
  }, [data.data, status]);

  const writable = (data.data?.connections ?? []).some((c) => c.writable);
  const canCreate = !!data.data?.can.create && writable;

  return (
    <ResourcePage
      title="Broadcasts"
      description="Write a message, pick a segment, preview it, then send or schedule it."
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-control border border-line bg-surface px-2 text-xs"
          aria-label="Status"
        >
          <option value="">Any status</option>
          {(Object.keys(STATUS_LABEL) as BroadcastStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {canCreate ? (
          <Link
            to="/$orgSlug/broadcasts/new"
            params={{ orgSlug }}
            className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink"
          >
            <Plus className="size-3.5" aria-hidden /> New broadcast
          </Link>
        ) : null}
      </div>

      {data.isPending ? (
        <ResourcePending />
      ) : data.isError ? (
        <ResourceError message="Could not load broadcasts." />
      ) : (data.data?.connections.length ?? 0) === 0 ? (
        <ResourceEmpty>
          Connect a Resend account first.{" "}
          <Link
            to="/$orgSlug/settings/connections"
            params={{ orgSlug }}
            className="font-semibold text-accent-fill hover:underline"
          >
            Open Connections
          </Link>
        </ResourceEmpty>
      ) : rows.length === 0 ? (
        <ResourceEmpty>
          {status ? "No broadcasts with that status." : "No broadcasts yet."}
        </ResourceEmpty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {rows.map((row) => {
            const when =
              row.status === "scheduled" && row.scheduledAt
                ? row.scheduledAt
                : (row.sentAt ?? row.updatedAt);
            return (
              <li key={row.id}>
                <Link
                  to="/$orgSlug/broadcasts/$broadcastId"
                  params={{ orgSlug, broadcastId: row.id }}
                  className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-canvas-sunken"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {row.subject || "No subject"}
                      {row.segmentName ? ` · ${row.segmentName}` : ""}
                      {` · ${row.connectionName}`}
                      {row.stats
                        ? ` · ${row.stats.delivered}/${row.stats.recipients} delivered`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-xs font-medium text-ink-secondary">
                      {STATUS_LABEL[row.status]}
                    </span>
                    <time className="text-xs text-ink-faint">{listTime(when, now)}</time>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ResourcePage>
  );
}
