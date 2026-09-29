"use client";

import { Paperclip, Undo2 } from "lucide-react";

import { StatusChip } from "@/components/app/status-chip";
import { statusLabel, statusState } from "@/components/activity/status";
import { Button } from "@/components/ui/button";
import type { MailFolder, MailListRowDTO } from "@/lib/dto/mail";
import { cn } from "@/lib/utils";
import { avatarColor, initials, listTime, useNow } from "./format";

function people(row: MailListRowDTO, folder: MailFolder): string {
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

/**
 * One list row (FED §5 / board): avatar, sender, subject and snippet, time, unread dot,
 * attachment icon. The AI-chip slot exists but stays hidden until triage lands (Phase 7).
 */
export function ThreadRow({
  row,
  folder,
  href,
  selected,
  onSelect,
  onRestore,
  arrived = false,
}: {
  row: MailListRowDTO;
  folder: MailFolder;
  href: string;
  selected: boolean;
  onSelect: (row: MailListRowDTO) => void;
  onRestore?: (row: MailListRowDTO) => void;
  /** Just arrived over the live stream: slide in with the accent highlight. */
  arrived?: boolean;
}) {
  const now = useNow();
  const name = people(row, folder);
  const seed = row.people[0] ?? row.subject;
  const trashed = folder === "trash";
  const openable = !!row.threadId && !trashed;
  const time =
    folder === "scheduled" && row.scheduledAt
      ? listTime(row.scheduledAt, now)
      : listTime(row.lastMessageAt, now);

  const content = (
    <>
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: avatarColor(seed) }}
      >
        {initials((row.peopleLabels?.[0] ?? row.people[0])?.split("@")[0] ?? "?")}
      </span>
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
            <span className="flex-none text-xs font-medium text-ink-faint">{row.messageCount}</span>
          ) : null}
          {/* AI chip slot: hidden until AI triage (Phase 7) */}
          <span
            hidden
            data-slot="ai-chip"
            className="rounded-full bg-canvas-sunken px-[7px] py-px text-[10.5px] font-bold text-ink-muted"
          />
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-muted">
          <span className="truncate">
            <b className={cn("font-semibold text-ink-secondary", row.unread && "text-ink")}>
              {row.subject || "(no subject)"}
            </b>
            {row.snippet ? <> · {row.snippet}</> : null}
          </span>
          {row.hasAttachments ? (
            <Paperclip aria-label="Has attachments" className="size-3 flex-none text-ink-faint" />
          ) : null}
        </span>
        {trashed ? (
          <span className="text-xs text-ink-faint">{purgeNote(row.purgeAt, now)}</span>
        ) : null}
      </span>
      <span className="grid justify-items-end gap-1">
        <time dateTime={row.lastMessageAt} className="text-xs text-ink-faint tabular-nums">
          {time}
        </time>
        {row.status && folder !== "trash" && (folder === "sent" || folder === "scheduled") ? (
          <StatusChip state={statusState(row.status)} className="px-2 py-px text-[11px]">
            {statusLabel(row.status)}
          </StatusChip>
        ) : null}
      </span>
    </>
  );

  const base =
    "grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150 outline-none";
  const state = selected ? "bg-accent-soft" : "hover:bg-canvas";

  return (
    <li
      data-testid="thread-row"
      data-unread={row.unread}
      data-row-id={row.id}
      data-arrived={arrived || undefined}
      className={arrived ? "live-arrive" : undefined}
    >
      {trashed ? (
        <div className={cn(base, "grid-cols-[32px_minmax(0,1fr)_auto_auto]", state)}>
          {content}
          {onRestore ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onRestore(row)}>
              <Undo2 aria-hidden /> Restore
            </Button>
          ) : null}
        </div>
      ) : openable ? (
        <a
          href={href}
          aria-current={selected ? "true" : undefined}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            onSelect(row);
          }}
          className={cn(base, state, "focus-visible:ring-2 focus-visible:ring-accent")}
        >
          {content}
        </a>
      ) : (
        <div className={cn(base, state)}>{content}</div>
      )}
    </li>
  );
}
