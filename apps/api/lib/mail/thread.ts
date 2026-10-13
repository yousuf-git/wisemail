import { createHash } from "node:crypto";

/**
 * Threading (TRD §2.4 step 5), deterministic and free of I/O: the caller supplies lookups.
 *
 *  1. `In-Reply-To`, then `References` (nearest first) matched against known Message-IDs;
 *  2. else same normalized subject + a shared participant + same mailbox within 14 days;
 *  3. else a new thread.
 *
 * A reference to a permanently deleted message (tombstone, matched by hash) never re-links to
 * the old thread and also skips the subject fallback: the conversation starts fresh.
 */

export const SUBJECT_WINDOW_DAYS = 14;
const SUBJECT_WINDOW_MS = SUBJECT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** `Re:`, `RE[2]:`, `Fwd:`, `Fw:`, `Aw:`, `Sv:`, `Antw:`, `WG:`, `Rv:`; repeated any number of times. */
const PREFIX = /^\s*(?:re|fwd?|aw|sv|antw|wg|rv|tr|enc)(?:\[\d+\]|\(\d+\))?\s*:\s*/i;

export function normalizeSubject(subject: string | null | undefined): string {
  let value = (subject ?? "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 20 && PREFIX.test(value); i++) value = value.replace(PREFIX, "");
  return value.trim();
}

/** Lowercase form used for matching. */
export const subjectKey = (subject: string | null | undefined) =>
  normalizeSubject(subject).toLowerCase();

/** Every `<id>` token of a `Message-ID` / `In-Reply-To` / `References` header, in order. */
export function extractMessageIds(header: string | string[] | null | undefined): string[] {
  const text = Array.isArray(header) ? header.join(" ") : (header ?? "");
  const ids = [...text.matchAll(/<([^<>\s]+)>/g)].map((m) => `<${m[1]}>`);
  if (ids.length > 0) return ids;
  // Some senders omit the brackets.
  const bare = text.trim();
  return bare && !/\s/.test(bare) && bare.includes("@") ? [`<${bare}>`] : [];
}

/** SHA-256 of the lowercased id without brackets, so tombstones never store the id itself. */
export function hashMessageId(id: string): string {
  return createHash("sha256")
    .update(id.trim().replace(/^</, "").replace(/>$/, "").toLowerCase())
    .digest("hex");
}

/** Candidate parent ids, nearest first: In-Reply-To, then References from last to first. */
export function parentCandidates(input: { inReplyTo?: string | null; references?: string[] }) {
  const ordered = [
    ...(input.inReplyTo ? extractMessageIds(input.inReplyTo).slice(0, 1) : []),
    ...[...(input.references ?? [])].reverse(),
  ];
  return [...new Set(ordered)];
}

export type ThreadingInput = {
  inReplyTo?: string | null;
  references?: string[];
  subject: string;
  /** External addresses of the conversation (lowercased). */
  participants: string[];
  mailboxAddress: string;
  at: Date;
};

export type ThreadCandidate = {
  threadId: string;
  subjectKey: string;
  participants: string[];
  mailboxAddress: string;
  lastMessageAt: Date;
};

export type ThreadingLookups = {
  /** Thread ids of known messages by Message-ID (unknown ids are absent). */
  threadsByMessageId(ids: string[]): Promise<Map<string, string>>;
  /** Which of these Message-ID hashes belong to permanently deleted messages. */
  tombstonedHashes(hashes: string[]): Promise<Set<string>>;
  /** Live threads whose normalized subject key matches, most recent first (caller may over-fetch). */
  threadsBySubject(key: string): Promise<ThreadCandidate[]>;
};

export type ThreadDecision =
  | { kind: "existing"; threadId: string; via: "message_id" | "subject" }
  | { kind: "new"; reason: "no_match" | "tombstoned_parent" | "empty_subject" };

export async function resolveThread(
  input: ThreadingInput,
  lookups: ThreadingLookups,
): Promise<ThreadDecision> {
  const candidates = parentCandidates(input);
  let sawTombstone = false;

  if (candidates.length > 0) {
    const dead = await lookups.tombstonedHashes(candidates.map(hashMessageId));
    const live = candidates.filter((id) => !dead.has(hashMessageId(id)));
    sawTombstone = live.length < candidates.length;
    if (live.length > 0) {
      const found = await lookups.threadsByMessageId(live);
      for (const id of live) {
        const threadId = found.get(id);
        if (threadId) return { kind: "existing", threadId, via: "message_id" };
      }
    }
  }
  if (sawTombstone) return { kind: "new", reason: "tombstoned_parent" };

  const key = subjectKey(input.subject);
  if (!key) return { kind: "new", reason: "empty_subject" };

  const people = new Set(input.participants.map((p) => p.toLowerCase()));
  const earliest = input.at.getTime() - SUBJECT_WINDOW_MS;
  const matches = (await lookups.threadsBySubject(key))
    .filter(
      (t) =>
        t.subjectKey === key &&
        t.mailboxAddress === input.mailboxAddress &&
        t.lastMessageAt.getTime() >= earliest &&
        t.participants.some((p) => people.has(p)),
    )
    // Deterministic: newest activity first, ties broken by id.
    .sort(
      (a, b) =>
        b.lastMessageAt.getTime() - a.lastMessageAt.getTime() ||
        b.threadId.localeCompare(a.threadId),
    );
  const best = matches[0];
  return best
    ? { kind: "existing", threadId: best.threadId, via: "subject" }
    : { kind: "new", reason: "no_match" };
}
