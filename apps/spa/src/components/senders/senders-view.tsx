import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Link2, MoreHorizontal, Plus, Star } from "lucide-react";

import { ResourceEmpty } from "@/components/resource-page";
import { setDefaultSender, setSenderDisabled } from "@/lib/actions";
import type { Sender, SendersPagePayload } from "@/lib/api";
import { cn } from "@/lib/utils";

import { DeleteSenderDialog } from "./delete-sender-dialog";
import { SenderDialog } from "./sender-dialog";
import { STATUS_LABEL, STATUS_TONE, senderReason } from "./sender-status";

export function SendersView({
  orgSlug,
  data,
  onChanged,
}: {
  orgSlug: string;
  data: SendersPagePayload;
  onChanged: () => void;
}) {
  const { senders, domains, can } = data;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Sender | null>(null);
  const [deleting, setDeleting] = useState<Sender | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Sender[]>();
    for (const sender of senders) {
      const list = map.get(sender.domainName) ?? [];
      list.push(sender);
      map.set(sender.domainName, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [senders]);

  async function toggleDisabled(sender: Sender) {
    setBusy(sender.id);
    setActionError(null);
    const disabling = sender.status !== "disabled";
    const result = await setSenderDisabled(orgSlug, sender.id, disabling);
    setBusy(null);
    setMenuId(null);
    if (!result.ok) {
      setActionError(result.error.message);
      return;
    }
    onChanged();
  }

  async function makeDefault(sender: Sender) {
    setBusy(sender.id);
    setActionError(null);
    const result = await setDefaultSender(orgSlug, sender.id, sender.version);
    setBusy(null);
    setMenuId(null);
    if (!result.ok) {
      setActionError(result.error.message);
      return;
    }
    onChanged();
  }

  const newButton = can.create ? (
    <button
      type="button"
      onClick={() => setCreating(true)}
      disabled={domains.length === 0}
      className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink disabled:opacity-50"
    >
      <Plus aria-hidden className="size-3.5" /> New sender
    </button>
  ) : null;

  const noDomains = domains.length === 0;

  return (
    <div className="grid gap-4">
      {actionError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {actionError}
        </p>
      ) : null}

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
          <Link
            to="/$orgSlug/settings/connections"
            params={{ orgSlug }}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-xs font-semibold text-ink"
          >
            <Link2 aria-hidden className="size-3.5" /> Open Connections
          </Link>
        </div>
      ) : null}

      {senders.length === 0 ? (
        <div className="grid gap-3">
          <ResourceEmpty>
            {noDomains
              ? "Senders live on domains that are verified in a connected Resend account. Connect one and it shows up here."
              : can.create
                ? "Pick a verified domain and a name like support@. You can add more later."
                : "Only Owners, Admins and Developers can create senders."}
          </ResourceEmpty>
          {noDomains ? (
            <Link
              to="/$orgSlug/settings/connections"
              params={{ orgSlug }}
              className="inline-flex h-9 w-fit items-center gap-1.5 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink"
            >
              Open Connections
            </Link>
          ) : (
            newButton
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {groups.map(([domain, list]) => (
            <section
              key={domain}
              aria-labelledby={`domain-${domain}`}
              className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
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
                      className="relative flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 min-[560px]:px-5"
                    >
                      <div className="grid min-w-0 gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[0.9375rem] font-semibold">
                            {sender.address}
                          </span>
                          {sender.isDefault ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-fill">
                              <Star aria-hidden className="size-3" /> Default
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              STATUS_TONE[sender.status],
                            )}
                          >
                            {STATUS_LABEL[sender.status]}
                          </span>
                        </div>
                        {sender.displayName ? (
                          <p className="truncate text-sm text-ink-secondary">{sender.displayName}</p>
                        ) : null}
                        {reason ? (
                          <p className="text-[0.8125rem] text-ink-muted">{reason}</p>
                        ) : null}
                        {sender.receivingNote ? (
                          <p className="text-[0.8125rem] text-ink-muted">{sender.receivingNote}</p>
                        ) : null}
                      </div>
                      {can.update || can.delete ? (
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            aria-label={`Actions for ${sender.address}`}
                            aria-expanded={menuId === sender.id}
                            disabled={busy === sender.id}
                            onClick={() =>
                              setMenuId((id) => (id === sender.id ? null : sender.id))
                            }
                            className="inline-flex size-8 items-center justify-center rounded-control text-ink-muted hover:bg-canvas-sunken disabled:opacity-50"
                          >
                            <MoreHorizontal aria-hidden className="size-4" />
                          </button>
                          {menuId === sender.id ? (
                            <div
                              role="menu"
                              className="absolute top-9 right-0 z-20 grid min-w-[11rem] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
                            >
                              {can.update ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="px-3 py-2 text-left text-sm hover:bg-canvas-sunken"
                                  onClick={() => {
                                    setMenuId(null);
                                    setEditing(sender);
                                  }}
                                >
                                  Edit
                                </button>
                              ) : null}
                              {can.update && !sender.isDefault && sender.status !== "disabled" ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="px-3 py-2 text-left text-sm hover:bg-canvas-sunken"
                                  onClick={() => void makeDefault(sender)}
                                >
                                  Make default
                                </button>
                              ) : null}
                              {can.update ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="px-3 py-2 text-left text-sm hover:bg-canvas-sunken"
                                  onClick={() => void toggleDisabled(sender)}
                                >
                                  {sender.status === "disabled" ? "Turn on" : "Turn off"}
                                </button>
                              ) : null}
                              {can.delete ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="px-3 py-2 text-left text-sm text-danger-ink hover:bg-danger-soft"
                                  onClick={() => {
                                    setMenuId(null);
                                    setDeleting(sender);
                                  }}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
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

      {can.create && domains.length > 0 ? (
        <SenderDialog
          orgSlug={orgSlug}
          domains={domains}
          open={creating}
          onOpenChange={setCreating}
          onSaved={onChanged}
        />
      ) : null}
      {editing ? (
        <SenderDialog
          key={editing.id}
          orgSlug={orgSlug}
          domains={domains}
          sender={editing}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          onSaved={onChanged}
        />
      ) : null}
      {deleting ? (
        <DeleteSenderDialog
          orgSlug={orgSlug}
          sender={deleting}
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          onDeleted={onChanged}
        />
      ) : null}
    </div>
  );
}
