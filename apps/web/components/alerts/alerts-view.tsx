"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteAlertRuleAction,
  setAlertRuleEnabledAction,
} from "@/app/(app)/[orgSlug]/alerts/actions";
import { EmptyState } from "@/components/app/empty-state";
import { relativeTime, useNow } from "@/components/inbox/format";
import { Wizi } from "@/components/mascot/wizi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { ALERT_KIND_INFO, describeCondition } from "@/lib/alerts/kinds";
import type { AlertQuota, AlertRuleDTO, AlertScopeOptions, IncidentDTO } from "@/lib/dto/alert";
import { IncidentStatus } from "./incident-status";
import { RuleDialog } from "./rule-dialog";

function scopeSummary(rule: AlertRuleDTO, options: AlertScopeOptions) {
  const names = (ids: string[], list: { id: string; name: string }[]) =>
    ids.map((id) => list.find((o) => o.id === id)?.name).filter(Boolean) as string[];
  const parts = [
    ...names(rule.scope.connectionIds, options.connections),
    ...names(rule.scope.domainIds, options.domains),
    ...names(rule.scope.projectIds, options.projects),
  ];
  return parts.length ? parts.join(", ") : "Whole workspace";
}

function IncidentRow({
  orgSlug,
  incident,
  now,
}: {
  orgSlug: string;
  incident: IncidentDTO;
  now: number;
}) {
  return (
    <li>
      <Link
        href={`/${orgSlug}/alerts/incidents/${incident.id}`}
        data-testid="incident-row"
        data-status={incident.status}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface p-3.5 shadow-md transition-colors duration-150 outline-none hover:bg-canvas-sunken focus-visible:ring-2 focus-visible:ring-accent min-[560px]:px-4"
      >
        <div className="min-w-0 flex-1 basis-64">
          <p className="truncate text-sm font-semibold">{incident.title}</p>
          <p className="line-clamp-1 text-[0.8125rem] text-ink-muted">{incident.summary}</p>
        </div>
        <span className="text-xs text-ink-muted" suppressHydrationWarning>
          {now ? relativeTime(incident.openedAt, now) : ""}
        </span>
        <IncidentStatus status={incident.status} />
      </Link>
    </li>
  );
}

/** Alerts landing page: incidents first (what needs a look), then the rules behind them. */
export function AlertsView({
  orgSlug,
  incidents,
  rules,
  quota,
  scopeOptions,
  can,
  isOwner,
}: {
  orgSlug: string;
  incidents: IncidentDTO[];
  rules: AlertRuleDTO[];
  quota: AlertQuota;
  scopeOptions: AlertScopeOptions;
  can: { create: boolean; update: boolean; delete: boolean };
  isOwner: boolean;
}) {
  const router = useRouter();
  const now = useNow();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<AlertRuleDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [deleting, setDeleting] = useState<AlertRuleDTO | null>(null);
  const active = incidents.filter((i) => i.status !== "resolved");
  const resolved = incidents.filter((i) => i.status === "resolved").slice(0, 8);
  const atLimit = quota.limit !== null && quota.used >= quota.limit;

  function toggle(rule: AlertRuleDTO, enabled: boolean) {
    startTransition(async () => {
      const result = await setAlertRuleEnabledAction(orgSlug, { id: rule.id, enabled });
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-8">
      <section aria-labelledby="incidents-h" className="grid gap-3">
        <h2 id="incidents-h" className="text-base font-semibold">
          Incidents
        </h2>
        {active.length === 0 ? (
          <EmptyState title="All quiet" mood="sleep" mascotSize={120}>
            {rules.length === 0
              ? "Create a rule below and Wisemail will tell you when something needs a look."
              : "No open incidents. Wizi is napping until a rule fires."}
          </EmptyState>
        ) : (
          <ul className="grid gap-2.5" aria-label="Open incidents">
            {active.map((i) => (
              <IncidentRow key={i.id} orgSlug={orgSlug} incident={i} now={now} />
            ))}
          </ul>
        )}
        {resolved.length > 0 ? (
          <details className="group">
            <summary className="cursor-pointer text-[0.8125rem] font-medium text-ink-muted hover:text-ink">
              Recently resolved ({resolved.length})
            </summary>
            <ul className="mt-2 grid gap-2.5" aria-label="Resolved incidents">
              {resolved.map((i) => (
                <IncidentRow key={i.id} orgSlug={orgSlug} incident={i} now={now} />
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="rules-h" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="rules-h" className="text-base font-semibold">
              Rules
            </h2>
            <p className="text-[0.8125rem] text-ink-muted" data-testid="rule-quota">
              {quota.limit === null
                ? `${quota.used} ${quota.used === 1 ? "rule" : "rules"} · unlimited on ${quota.planLabel}`
                : `${quota.used} of ${quota.limit} rules on ${quota.planLabel}`}
            </p>
          </div>
          {can.create ? (
            <Button
              className="font-bold"
              onClick={() => (atLimit ? setLimitOpen(true) : setCreating(true))}
            >
              <Plus aria-hidden /> New rule
            </Button>
          ) : null}
        </div>

        {rules.length === 0 ? (
          <EmptyState
            title="No rules yet"
            mascot={false}
            action={
              can.create ? (
                <Button className="font-bold" onClick={() => setCreating(true)}>
                  <Plus aria-hidden /> Create your first rule
                </Button>
              ) : undefined
            }
          >
            A rule watches something, like the bounce rate on a domain, and alerts you when it
            crosses a line.
          </EmptyState>
        ) : (
          <ul className="grid gap-2.5" aria-label="Alert rules">
            {rules.map((rule) => (
              <li
                key={rule.id}
                data-testid={`rule-${rule.name}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface p-3.5 shadow-md min-[560px]:px-4"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <p className="truncate text-sm font-semibold">
                    {rule.name}
                    {rule.activeIncidents > 0 ? (
                      <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger-ink">
                        {rule.activeIncidents} open
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[0.8125rem] text-ink-muted">
                    {ALERT_KIND_INFO[rule.kind].label} ·{" "}
                    {describeCondition(rule.kind, rule.condition)} ·{" "}
                    {scopeSummary(rule, scopeOptions)}
                  </p>
                </div>
                <Switch
                  checked={rule.enabled}
                  disabled={!can.update || pending}
                  onCheckedChange={(v) => toggle(rule, v)}
                  aria-label={`${rule.name} is ${rule.enabled ? "on" : "off"}`}
                />
                {can.update || can.delete ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${rule.name}`}
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 rounded-lg shadow-lg">
                      {can.update ? (
                        <DropdownMenuItem onSelect={() => setEditing(rule)}>Edit…</DropdownMenuItem>
                      ) : null}
                      {can.update && can.delete ? <DropdownMenuSeparator /> : null}
                      {can.delete ? (
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(rule)}>
                          Delete…
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {creating ? (
        <RuleDialog
          orgSlug={orgSlug}
          open
          onOpenChange={(o) => !o && setCreating(false)}
          scopeOptions={scopeOptions}
        />
      ) : null}
      {editing ? (
        <RuleDialog
          orgSlug={orgSlug}
          rule={editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          scopeOptions={scopeOptions}
        />
      ) : null}

      <Dialog open={limitOpen} onOpenChange={setLimitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="items-center text-center">
            <Wizi mood="thinking" size={64} />
            <DialogTitle className="text-xl">
              You&apos;ve used {quota.used} of {quota.limit} alert rules on {quota.planLabel}
            </DialogTitle>
            <DialogDescription>
              {quota.nextTierLabel
                ? `${quota.nextTierLabel} has room for more. Nothing you have now is removed.`
                : "Remove a rule to make room for another."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitOpen(false)}>
              Not now
            </Button>
            {quota.nextTierLabel ? (
              isOwner ? (
                <Button asChild className="font-bold">
                  <Link href={`/${orgSlug}/settings/billing`}>
                    Upgrade to {quota.nextTierLabel}
                  </Link>
                </Button>
              ) : (
                <Button disabled>Ask your Owner to upgrade</Button>
              )
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              The rule and its incident history go away for good. You can always make a new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteAlertRuleAction(orgSlug, { id: deleting!.id });
                  if (!result.ok) toast.error(result.error.message);
                  else toast.success("Rule deleted");
                  setDeleting(null);
                  router.refresh();
                })
              }
            >
              Delete rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
