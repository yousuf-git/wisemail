"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  createSegmentAction,
  deleteSegmentAction,
  renameSegmentAction,
} from "@/app/(app)/[orgSlug]/audience/actions";
import { EmptyState } from "@/components/app/empty-state";
import { LiveRefresh } from "@/components/app/live-refresh";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConnectionOptionDTO, SegmentDTO } from "@/lib/dto/audience";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { ConnectionSelect, firstWritable } from "./connection-select";
import { audienceError, fieldErrorMap } from "./errors";

function SegmentDialog({
  orgSlug,
  connections,
  segment,
  onOpenChange,
}: {
  orgSlug: string;
  connections: ConnectionOptionDTO[];
  segment?: SegmentDTO;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [connectionId, setConnectionId] = useState(firstWritable(connections));
  const [name, setName] = useState(segment?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Give the segment a name.");
    setBusy(true);
    setError(null);
    const result = segment
      ? await renameSegmentAction(orgSlug, { id: segment.id, name })
      : await createSegmentAction(orgSlug, { connectionId, name });
    setBusy(false);
    if (!result.ok) {
      setError(fieldErrorMap(result.error.fieldErrors).name ?? audienceError(result.error));
      return;
    }
    toast.success(segment ? "Segment renamed" : `Created ${result.data.name}`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-xl">
              {segment ? "Rename segment" : "New segment"}
            </DialogTitle>
            <DialogDescription>
              {segment
                ? "Renamed in Resend first, then here."
                : "A segment is a group of contacts you can send a broadcast to."}
            </DialogDescription>
          </DialogHeader>
          {!segment && connections.length > 1 ? (
            <ConnectionSelect
              id="segment-connection"
              connections={connections}
              value={connectionId}
              onChange={setConnectionId}
            />
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="segment-name">Name</Label>
            <Input
              id="segment-name"
              value={name}
              maxLength={100}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="Newsletter subscribers"
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || (!segment && !connectionId)}
              className="font-bold"
            >
              {busy ? "Saving…" : segment ? "Save" : "Create segment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Segments across connections (PRD §5.9): create, rename, delete. Contacts are added to them on the contact page or at import. */
export function SegmentsView({
  orgSlug,
  segments,
  connections,
  canManage,
}: {
  orgSlug: string;
  segments: SegmentDTO[];
  connections: ConnectionOptionDTO[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<SegmentDTO | null>(null);
  const [deleting, setDeleting] = useState<SegmentDTO | null>(null);
  const writable = connections.some((c) => c.writable);
  const multi = connections.length > 1;

  const newButton = canManage ? (
    <Button
      type="button"
      onClick={() => setCreating(true)}
      disabled={!writable}
      className="font-bold"
    >
      <Plus aria-hidden /> New segment
    </Button>
  ) : null;

  return (
    <div className="grid gap-3">
      <LiveRefresh topics={["segments", "contacts"]} />
      {segments.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">
            {segments.length} {segments.length === 1 ? "segment" : "segments"}
          </p>
          {newButton}
        </div>
      ) : null}
      {segments.length === 0 ? (
        <EmptyState title="No segments yet" mood="idle" action={newButton}>
          Segments group contacts so a broadcast reaches the right people. Create one, then add
          contacts to it.
        </EmptyState>
      ) : (
        <ul role="list" className="grid gap-0.5 rounded-xl bg-surface p-1.5 shadow-md">
          {segments.map((s) => (
            <li
              key={s.id}
              data-testid="segment-row"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-canvas"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/${orgSlug}/audience/contacts?segmentId=${s.id}`}
                  className="truncate text-[13.5px] font-semibold outline-none hover:underline focus-visible:underline"
                >
                  {s.name}
                </Link>
                {multi ? (
                  <p className="truncate text-xs text-ink-muted">{s.connectionName}</p>
                ) : null}
              </div>
              <span className="text-[13px] text-ink-muted tabular-nums">
                {s.contactCount.toLocaleString()} {s.contactCount === 1 ? "contact" : "contacts"}
              </span>
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${s.name}`}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRenaming(s)}>Rename</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(s)}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <SegmentDialog
          orgSlug={orgSlug}
          connections={connections}
          onOpenChange={(o) => !o && setCreating(false)}
        />
      ) : null}
      {renaming ? (
        <SegmentDialog
          orgSlug={orgSlug}
          connections={connections}
          segment={renaming}
          onOpenChange={(o) => !o && setRenaming(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete segment"
          onConfirm={async () => {
            const result = await deleteSegmentAction(orgSlug, { id: deleting.id });
            if (!result.ok) return audienceError(result.error);
            toast.success("Segment deleted");
            router.refresh();
            return null;
          }}
        >
          <p>
            This also deletes the segment in Resend ({deleting.connectionName}). The contacts
            themselves stay.
          </p>
          <p>Draft broadcasts aimed at it will need a new segment before they can be sent.</p>
        </ConfirmDeleteDialog>
      ) : null}
    </div>
  );
}
