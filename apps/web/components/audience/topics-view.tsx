"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  createTopicAction,
  deleteTopicAction,
  updateTopicAction,
} from "@/app/(app)/[orgSlug]/audience/actions";
import { EmptyState } from "@/components/app/empty-state";
import { LiveRefresh } from "@/components/app/live-refresh";
import { StatusChip } from "@/components/app/status-chip";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConnectionOptionDTO, TopicDTO } from "@/lib/dto/audience";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { ConnectionSelect, firstWritable } from "./connection-select";
import { audienceError, fieldErrorMap } from "./errors";

function TopicDialog({
  orgSlug,
  connections,
  topic,
  onOpenChange,
}: {
  orgSlug: string;
  connections: ConnectionOptionDTO[];
  topic?: TopicDTO;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [connectionId, setConnectionId] = useState(firstWritable(connections));
  const [name, setName] = useState(topic?.name ?? "");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [defaultSubscription, setDefault] = useState<"opt_in" | "opt_out">(
    topic?.defaultSubscription ?? "opt_in",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Give the topic a name.");
    setBusy(true);
    setError(null);
    const result = topic
      ? await updateTopicAction(orgSlug, { id: topic.id, name, description })
      : await createTopicAction(orgSlug, { connectionId, name, description, defaultSubscription });
    setBusy(false);
    if (!result.ok) {
      setError(fieldErrorMap(result.error.fieldErrors).name ?? audienceError(result.error));
      return;
    }
    toast.success(topic ? "Topic saved" : `Created ${result.data.name}`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-xl">{topic ? "Edit topic" : "New topic"}</DialogTitle>
            <DialogDescription>
              Topics let people choose which kinds of email they get.
            </DialogDescription>
          </DialogHeader>
          {!topic && connections.length > 1 ? (
            <ConnectionSelect
              id="topic-connection"
              connections={connections}
              value={connectionId}
              onChange={setConnectionId}
            />
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="topic-name">Name</Label>
            <Input
              id="topic-name"
              value={name}
              maxLength={100}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="Product updates"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="topic-description">
              Description <span className="font-normal text-ink-muted">(optional)</span>
            </Label>
            <Input
              id="topic-description"
              value={description}
              maxLength={300}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="topic-default">New contacts are</Label>
            <Select
              value={defaultSubscription}
              onValueChange={(v) => setDefault(v as "opt_in" | "opt_out")}
              disabled={!!topic}
            >
              <SelectTrigger id="topic-default" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opt_in">Subscribed until they opt out</SelectItem>
                <SelectItem value="opt_out">Not subscribed until they opt in</SelectItem>
              </SelectContent>
            </Select>
            {topic ? (
              <p className="text-xs text-ink-muted">
                Resend doesn&apos;t let this change after the topic is created.
              </p>
            ) : null}
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
              disabled={busy || (!topic && !connectionId)}
              className="font-bold"
            >
              {busy ? "Saving…" : topic ? "Save" : "Create topic"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Topics across connections (PRD §5.9): create, edit name and description, delete. */
export function TopicsView({
  orgSlug,
  topics,
  connections,
  canManage,
}: {
  orgSlug: string;
  topics: TopicDTO[];
  connections: ConnectionOptionDTO[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TopicDTO | null>(null);
  const [deleting, setDeleting] = useState<TopicDTO | null>(null);
  const writable = connections.some((c) => c.writable);
  const multi = connections.length > 1;
  const newButton = canManage ? (
    <Button
      type="button"
      onClick={() => setCreating(true)}
      disabled={!writable}
      className="font-bold"
    >
      <Plus aria-hidden /> New topic
    </Button>
  ) : null;

  return (
    <div className="grid gap-3">
      <LiveRefresh topics={["topics", "contacts"]} />
      {topics.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">
            {topics.length} {topics.length === 1 ? "topic" : "topics"}
          </p>
          {newButton}
        </div>
      ) : null}
      {topics.length === 0 ? (
        <EmptyState title="No topics yet" mood="idle" action={newButton}>
          Topics like &quot;Product updates&quot; or &quot;Weekly digest&quot; let people pick what
          they receive, and let you aim a broadcast at those who want it.
        </EmptyState>
      ) : (
        <ul role="list" className="grid gap-0.5 rounded-xl bg-surface p-1.5 shadow-md">
          {topics.map((t) => (
            <li
              key={t.id}
              data-testid="topic-row"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-canvas"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">{t.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {[multi ? t.connectionName : "", t.description].filter(Boolean).join(" · ") ||
                    "No description"}
                </p>
              </div>
              <StatusChip state={t.defaultSubscription === "opt_in" ? "info" : "neutral"}>
                {t.defaultSubscription === "opt_in" ? "Opt-in by default" : "Opt-out by default"}
              </StatusChip>
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${t.name}`}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(t)}>Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(t)}>
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
        <TopicDialog
          orgSlug={orgSlug}
          connections={connections}
          onOpenChange={(o) => !o && setCreating(false)}
        />
      ) : null}
      {editing ? (
        <TopicDialog
          orgSlug={orgSlug}
          connections={connections}
          topic={editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete topic"
          onConfirm={async () => {
            const result = await deleteTopicAction(orgSlug, { id: deleting.id });
            if (!result.ok) return audienceError(result.error);
            toast.success("Topic deleted");
            router.refresh();
            return null;
          }}
        >
          <p>
            This also deletes the topic in Resend ({deleting.connectionName}) and everyone&apos;s
            choices for it.
          </p>
          <p>Broadcasts that used this topic will go to their whole segment instead.</p>
        </ConfirmDeleteDialog>
      ) : null}
    </div>
  );
}
