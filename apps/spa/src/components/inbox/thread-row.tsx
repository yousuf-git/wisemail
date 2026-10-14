import { Paperclip } from "lucide-react";
import { Link } from "@tanstack/react-router";

import type { MailFolder, MailListRow } from "@/lib/api";
import { cn } from "@/lib/utils";

import { avatarColor, initials, listTime, useNow } from "./format";
import { TriageChip } from "./triage-chip";

function peopleLabel(row: MailListRow, folder: MailFolder): string {
  const [first, ...rest] = row.peopleLabels?.length ? row.peopleLabels : row.people;
  if (!first) return "(no recipients)";
  const label = row.kind === "email" && folder !== "trash" ? `To: ${first}` : first;
  return rest.length ? `${label} +${rest.length}` : label;
}

function purgeNote(purgeAt: string | null, now: number): string | null {
  if (!purgeAt || !now) return null;
  const days = Math.max(0, Math.ceil((new Date(purgeAt).getTime() - now) / 86_400_000));
  return `Deletes permanently in ${days} ${days === 1 ? "day" : "days"}`;
}

export function ThreadRow({
  row,
  orgSlug,
  folder,
  selected,
  selecting,
  checked,
  onToggle,
  onRestore,
}: {
  row: MailListRow;
  orgSlug: string;
  folder: MailFolder;
  selected?: boolean;
  selecting?: boolean;
  checked?: boolean;
  onToggle?: () => void;
  onRestore?: () => void;
}) {
  const now = useNow();
  const name = peopleLabel(row, folder);
  const seed = row.people[0] ?? row.subject;
  const trashed = folder === "trash";
  const threadId = row.kind === "thread" ? row.id : row.threadId;
  const openable = !!threadId && !trashed;
  const time =
    folder === "scheduled" && row.scheduledAt
      ? listTime(row.scheduledAt, now)
      : listTime(row.lastMessageAt, now);

  const content = (
    <>
      {selecting ? (
        <span className="grid size-8 place-items-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle?.()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${row.subject || "(no subject)"}`}
            className="size-4 rounded border-line"
          />
        </span>
      ) : (
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: avatarColor(seed) }}
        >
          {initials((row.peopleLabels?.[0] ?? row.people[0])?.split("@")[0] ?? "?")}
        </span>
      )}
      <span className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold">
          {row.unread ? (
            <span
              role="img"
              aria-label="Unread"
              className="size-[7px] flex-none rounded-full bg-accent"
            />
          ) : null}
          <span className={cn("truncate", !row.unread && "font-medium")}>{name}</span>
          {row.messageCount > 1 ? (
            <span className="flex-none text-xs font-medium text-ink-muted">{row.messageCount}</span>
          ) : null}
          {row.ai && folder === "inbox" ? <TriageChip ai={row.ai} /> : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-muted">
          <span className="truncate">
            <b className={cn("font-semibold text-ink-secondary", row.unread && "text-ink")}>
              {row.subject || "(no subject)"}
            </b>
            {row.snippet ? <> · {row.snippet}</> : null}
          </span>
          {row.hasAttachments ? (
            <Paperclip aria-label="Has attachments" className="size-3 flex-none text-ink-muted" />
          ) : null}
        </span>
        {trashed ? (
          <span className="text-xs text-ink-muted">{purgeNote(row.purgeAt, now)}</span>
        ) : null}
      </span>
      <span className="grid justify-items-end gap-1">
        <time dateTime={row.lastMessageAt} className="text-xs text-ink-muted tabular-nums">
          {time}
        </time>
        {row.status && (folder === "sent" || folder === "scheduled") ? (
          <span className="rounded-full bg-canvas-sunken px-2 py-px text-[11px] font-medium text-ink-muted">
            {row.status}
          </span>
        ) : null}
      </span>
    </>
  );

  const base =
    "grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left transition-colors outline-none";
  const state = selected || (selecting && checked) ? "bg-accent-soft" : "hover:bg-canvas";

  if (trashed) {
    return (
      <li data-testid="thread-row" data-unread={row.unread} className="border-b border-line last:border-0">
        <div className={cn(base, "grid-cols-[32px_minmax(0,1fr)_auto_auto]", state)}>
          {content}
          {onRestore && !selecting ? (
            <button
              type="button"
              onClick={onRestore}
              className="h-8 rounded-control border border-line px-2.5 text-xs font-medium hover:bg-canvas-sunken"
            >
              Restore
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  if (openable && !selecting && threadId) {
    return (
      <li data-testid="thread-row" data-unread={row.unread} className="border-b border-line last:border-0">
        <Link
          to="/$orgSlug/inbox/$threadId"
          params={{ orgSlug, threadId }}
          aria-current={selected ? "true" : undefined}
          className={cn(base, state, "focus-visible:ring-2 focus-visible:ring-accent")}
        >
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li data-testid="thread-row" data-unread={row.unread} className="border-b border-line last:border-0">
      <div
        className={cn(base, state, selecting && "cursor-pointer")}
        onClick={selecting ? onToggle : undefined}
        onKeyDown={
          selecting
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle?.();
                }
              }
            : undefined
        }
        role={selecting ? "button" : undefined}
        tabIndex={selecting ? 0 : undefined}
      >
        {content}
      </div>
    </li>
  );
}
