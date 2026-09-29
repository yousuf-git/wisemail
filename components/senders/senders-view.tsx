"use client";

import { Link2, MoreHorizontal, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  setSenderDisabledAction,
  updateSenderAction,
} from "@/app/(app)/[orgSlug]/settings/senders/actions";
import { EmptyState } from "@/components/app/empty-state";
import { StatusChip } from "@/components/app/status-chip";
import { friendlyError } from "@/components/composer/errors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SenderDTO } from "@/lib/dto/mail";
import { DeleteSenderDialog } from "./delete-sender-dialog";
import { SenderDialog } from "./sender-dialog";
import { STATUS_LABEL, STATUS_STATE, senderReason } from "./sender-status";

export type SenderDomainOption = { id: string; name: string; receiving: boolean };
export type SenderPermissions = { create: boolean; update: boolean; delete: boolean };

export function SendersView({
  orgSlug,
  senders,
  domains,
  can,
}: {
  orgSlug: string;
  senders: SenderDTO[];
  domains: SenderDomainOption[];
  can: SenderPermissions;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SenderDTO | null>(null);
  const [deleting, setDeleting] = useState<SenderDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, SenderDTO[]>();
    for (const sender of senders) {
      const list = map.get(sender.domainName) ?? [];
      list.push(sender);
      map.set(sender.domainName, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [senders]);

  async function toggleDisabled(sender: SenderDTO) {
    setBusy(sender.id);
    const disabling = sender.status !== "disabled";
    const result = await setSenderDisabledAction(orgSlug, { id: sender.id, disabled: disabling });
    setBusy(null);
    if (!result.ok) return void toast.error(friendlyError(result.error).message);
    toast.success(disabling ? `${sender.address} turned off` : `${sender.address} turned on`);
    router.refresh();
  }

  async function makeDefault(sender: SenderDTO) {
    setBusy(sender.id);
    const result = await updateSenderAction(orgSlug, {
      id: sender.id,
      version: sender.version,
      isDefault: true,
    });
    setBusy(null);
    if (!result.ok) return void toast.error(friendlyError(result.error).message);
    toast.success(`${sender.address} is now the default for ${sender.domainName}`);
    router.refresh();
  }

  const newButton = can.create ? (
    <Button onClick={() => setCreating(true)} disabled={domains.length === 0} className="font-bold">
      <Plus aria-hidden /> New sender
    </Button>
  ) : null;

  const noDomains = domains.length === 0;

  return (
    <div className="grid gap-4">
      {senders.length > 0 || !noDomains ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {senders.length} {senders.length === 1 ? "sender" : "senders"} on {groups.length}{" "}
            {groups.length === 1 ? "domain" : "domains"}
          </p>
          {senders.length > 0 ? newButton : null}
        </div>
      ) : null}

      {noDomains && can.create ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-ink"
        >
          <span>
            No verified domains yet. Connect a Resend account with a verified domain, then come back
            to create a sender.
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href={`/${orgSlug}/settings/connections`}>
              <Link2 aria-hidden /> Open Connections
            </Link>
          </Button>
        </div>
      ) : null}

      {senders.length === 0 ? (
        <EmptyState
          title={noDomains ? "Verify a domain to create senders" : "Create your first sender"}
          mood="idle"
          action={
            noDomains ? (
              <Button asChild className="font-bold">
                <Link href={`/${orgSlug}/settings/connections`}>Open Connections</Link>
              </Button>
            ) : (
              newButton
            )
          }
        >
          {noDomains
            ? "Senders live on domains that are verified in a connected Resend account. Connect one and it shows up here."
            : can.create
              ? "Pick a verified domain and a name like support@. You can add more later."
              : "Only Owners, Admins and Developers can create senders."}
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {groups.map(([domain, list]) => (
            <section
              key={domain}
              aria-labelledby={`domain-${domain}`}
              className="overflow-hidden rounded-xl bg-surface shadow-md"
            >
              <h2
                id={`domain-${domain}`}
                className="border-b border-line bg-canvas-sunken px-4 py-2.5 text-sm font-semibold min-[560px]:px-5"
              >
                {domain}
              </h2>
              <ul>
                {list.map((sender) => {
                  const reason = senderReason(sender);
                  return (
                    <li
                      key={sender.id}
                      data-testid="sender-row"
                      data-status={sender.status}
                      className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 min-[560px]:px-5"
                    >
                      <div className="grid min-w-0 gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[0.9375rem] font-semibold">
                            {sender.address}
                          </span>
                          {sender.isDefault ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold">
                              <Star aria-hidden className="size-3" /> Default
                            </span>
                          ) : null}
                          <StatusChip state={STATUS_STATE[sender.status]}>
                            {STATUS_LABEL[sender.status]}
                          </StatusChip>
                        </div>
                        {sender.displayName ? (
                          <p className="truncate text-sm text-ink-secondary">
                            {sender.displayName}
                          </p>
                        ) : null}
                        {reason ? (
                          <p className="text-[0.8125rem] text-ink-muted">{reason}</p>
                        ) : null}
                        {sender.receivingNote ? (
                          <p className="text-[0.8125rem] text-ink-muted">{sender.receivingNote}</p>
                        ) : null}
                      </div>
                      {can.update || can.delete ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${sender.address}`}
                              disabled={busy === sender.id}
                            >
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-lg shadow-lg">
                            {can.update ? (
                              <DropdownMenuItem onSelect={() => setEditing(sender)}>
                                Edit
                              </DropdownMenuItem>
                            ) : null}
                            {can.update && !sender.isDefault && sender.status !== "disabled" ? (
                              <DropdownMenuItem onSelect={() => void makeDefault(sender)}>
                                Make default
                              </DropdownMenuItem>
                            ) : null}
                            {can.update ? (
                              <DropdownMenuItem onSelect={() => void toggleDisabled(sender)}>
                                {sender.status === "disabled" ? "Turn on" : "Turn off"}
                              </DropdownMenuItem>
                            ) : null}
                            {can.update && can.delete ? <DropdownMenuSeparator /> : null}
                            {can.delete ? (
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setDeleting(sender)}
                              >
                                Delete
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!can.create && senders.length > 0 ? (
        <p className="text-sm text-ink-muted">
          Only Owners, Admins and Developers can create or change senders.
        </p>
      ) : null}

      <SenderDialog
        orgSlug={orgSlug}
        domains={domains}
        open={creating}
        onOpenChange={setCreating}
      />
      {editing ? (
        <SenderDialog
          key={editing.id}
          orgSlug={orgSlug}
          domains={domains}
          sender={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <DeleteSenderDialog
          orgSlug={orgSlug}
          sender={deleting}
          open
          onOpenChange={(open) => !open && setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
