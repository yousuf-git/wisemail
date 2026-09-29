"use client";

import { Globe, Link2, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { StatusChip } from "@/components/app/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DomainDTO } from "@/lib/dto/domain";
import { AddDomainDialog, type ConnectionOption } from "./add-domain-dialog";
import { ProjectSelect, TrackingSwitch, type ProjectChoice } from "./domain-controls";
import { domainStatus, VERDICT } from "./domain-status";

export type DomainPermissions = {
  create: boolean;
  update: boolean;
  assignProject: boolean;
};

const ALL = "all";

/** Does DNS need a look? Resend not verified, or our own check found SPF or DKIM gone. */
function needsAttention(d: DomainDTO) {
  const c = d.dnsCheck;
  return (
    d.status !== "verified" ||
    (!!c && (c.spf === "fail" || c.spf === "missing" || c.dkim === "fail" || c.dkim === "missing"))
  );
}

export function DomainsView({
  orgSlug,
  domains,
  connections,
  projects,
  can,
  projectRequired,
}: {
  orgSlug: string;
  domains: DomainDTO[];
  /** Connections that can add domains (active). */
  connections: ConnectionOption[];
  projects: ProjectChoice[];
  can: DomainPermissions;
  projectRequired: boolean;
}) {
  const [query, setQuery] = useState("");
  const [connection, setConnection] = useState(ALL);
  const [state, setState] = useState<"all" | "attention">("all");

  const connectionNames = useMemo(
    () => [...new Map(domains.map((d) => [d.connectionId, d.connectionName])).entries()],
    [domains],
  );
  const shown = domains.filter(
    (d) =>
      (!query.trim() || d.name.includes(query.trim().toLowerCase())) &&
      (connection === ALL || d.connectionId === connection) &&
      (state === "all" || needsAttention(d)),
  );
  const attention = domains.filter(needsAttention).length;

  const addButton = can.create ? (
    connections.length > 0 ? (
      <AddDomainDialog
        orgSlug={orgSlug}
        connections={connections}
        projects={projects}
        projectRequired={projectRequired}
      />
    ) : (
      <Button asChild variant="outline">
        <Link href={`/${orgSlug}/settings/connections`}>
          <Link2 aria-hidden /> Connect an account
        </Link>
      </Button>
    )
  ) : null;

  if (domains.length === 0) {
    return (
      <EmptyState title="No domains yet" mood="idle" action={addButton}>
        {connections.length === 0
          ? "Domains come from your connected Resend accounts. Connect one and its domains show up here."
          : can.create
            ? "Add a domain to send from your own address. Wisemail shows the DNS records to create."
            : "Domains appear here as soon as an Owner or Admin adds them in a connected Resend account."}
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-1 min-[560px]:max-w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search domains"
            aria-label="Search domains"
            className="pl-9"
          />
        </div>
        {connectionNames.length > 1 ? (
          <Select value={connection} onValueChange={setConnection}>
            <SelectTrigger aria-label="Filter by connection" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All accounts</SelectItem>
              {connectionNames.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div role="group" aria-label="Filter by health" className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={state === "all" ? "secondary" : "ghost"}
            aria-pressed={state === "all"}
            onClick={() => setState("all")}
          >
            All ({domains.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={state === "attention" ? "secondary" : "ghost"}
            aria-pressed={state === "attention"}
            onClick={() => setState("attention")}
          >
            Needs a look ({attention})
          </Button>
        </div>
        <div className="ml-auto">{addButton}</div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl bg-surface px-5 py-8 text-center text-sm text-ink-muted shadow-md">
          No domains match those filters.
        </p>
      ) : (
        <ul className="grid gap-3" aria-label="Domains">
          {shown.map((d) => {
            const status = domainStatus(d.status);
            const drift =
              d.dnsCheck &&
              (d.dnsCheck.spf === "fail" ||
                d.dnsCheck.spf === "missing" ||
                d.dnsCheck.dkim === "fail" ||
                d.dnsCheck.dkim === "missing");
            return (
              <li
                key={d.id}
                data-testid="domain-row"
                data-status={d.status}
                className="grid gap-3.5 rounded-xl bg-surface p-4 shadow-md min-[900px]:grid-cols-[minmax(0,1.4fr)_auto_minmax(9rem,12rem)] min-[900px]:items-center min-[900px]:gap-5"
              >
                <div className="grid min-w-0 gap-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Link
                      href={`/${orgSlug}/domains/${d.id}`}
                      className="flex min-w-0 items-center gap-2 rounded-sm text-[0.9375rem] font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Globe aria-hidden className="size-4 shrink-0 text-ink-muted" />
                      <span className="truncate">{d.name}</span>
                    </Link>
                    <StatusChip state={status.state}>{status.label}</StatusChip>
                    {drift ? (
                      <StatusChip state="danger">
                        {d.dnsCheck!.spf === "fail" || d.dnsCheck!.spf === "missing"
                          ? `SPF ${VERDICT[d.dnsCheck!.spf].label.toLowerCase()}`
                          : `DKIM ${VERDICT[d.dnsCheck!.dkim].label.toLowerCase()}`}
                      </StatusChip>
                    ) : null}
                  </div>
                  <p className="truncate text-[0.8125rem] text-ink-muted">
                    {d.connectionName} · {d.region ?? "region unknown"} ·{" "}
                    {d.receivingEnabled
                      ? d.receivingVerified
                        ? "Receiving on"
                        : "Receiving: MX not verified"
                      : "Receiving off"}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-[0.8125rem]">
                  <label className="flex items-center gap-2">
                    <TrackingSwitch
                      orgSlug={orgSlug}
                      domain={d}
                      kind="open"
                      disabled={!can.update}
                    />
                    Opens
                  </label>
                  <label className="flex items-center gap-2">
                    <TrackingSwitch
                      orgSlug={orgSlug}
                      domain={d}
                      kind="click"
                      disabled={!can.update}
                    />
                    Clicks
                  </label>
                </div>

                <ProjectSelect
                  orgSlug={orgSlug}
                  domain={d}
                  projects={projects}
                  disabled={!can.assignProject || projects.length === 0}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
