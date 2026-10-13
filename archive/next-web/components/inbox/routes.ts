import type { MailFolder } from "@/lib/dto/mail";

export const FOLDERS: { id: MailFolder; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
  { id: "scheduled", label: "Scheduled" },
  { id: "trash", label: "Trash" },
];

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export type InboxRoute = { folder: MailFolder; threadId: string | null };

/**
 * `/inbox` -> inbox, `/inbox/<id>`, `/inbox/sent`, `/inbox/sent/<id>`, `/inbox/trash`.
 * Thread ids are 24-char hex, so they can never collide with a folder name. `null` = not found.
 */
export function parseInboxSegments(segments: string[] | undefined): InboxRoute | null {
  const [first, second, ...rest] = segments ?? [];
  if (rest.length > 0) return null;
  if (!first) return { folder: "inbox", threadId: null };
  if (first === "sent" || first === "trash" || first === "scheduled") {
    if (second && !OBJECT_ID.test(second)) return null;
    return { folder: first, threadId: second ?? null };
  }
  if (second || !OBJECT_ID.test(first)) return null;
  return { folder: "inbox", threadId: first };
}

/** Browser path for a folder (and optionally a thread) below the org. */
export function inboxHref(orgSlug: string, folder: MailFolder, threadId?: string | null): string {
  if (folder === "scheduled" && !threadId) return `/${orgSlug}/scheduled`;
  const base = `/${orgSlug}/inbox`;
  const path = folder === "inbox" ? base : `${base}/${folder}`;
  return threadId ? `${path}/${threadId}` : path;
}
