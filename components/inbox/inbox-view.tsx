"use client";

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { Inbox as InboxGlyph } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import type { SenderOptionDTO } from "@/components/composer/composer";
import { Button } from "@/components/ui/button";
import type { MailFolder, MailListRowDTO, Page, ThreadDetailDTO } from "@/lib/dto/mail";
import { cn } from "@/lib/utils";
import { fetchThreadList, threadListKey, type ThreadListParams } from "./api";
import { inboxHref, parseInboxSegments } from "./routes";
import { ThreadList } from "./thread-list";
import { ThreadView } from "./thread-view";
import { useMailActions } from "./use-mail-actions";
import { useMailShortcuts } from "./use-mail-shortcuts";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

const EMPTY_COPY: Record<MailFolder, { title: string; body: string; mood: "sleep" | "happy" }> = {
  inbox: {
    title: "Inbox zero",
    body: "Replies to your emails land here. If nothing arrives, check that receiving is on for your domain.",
    mood: "sleep",
  },
  sent: {
    title: "Nothing sent yet",
    body: "Emails you send from Wisemail show up here with their delivery progress.",
    mood: "happy",
  },
  scheduled: { title: "Nothing scheduled", body: "Scheduled emails wait here.", mood: "happy" },
  trash: {
    title: "Trash is empty",
    body: "Moved to Trash means gone in 30 days. You can restore anything until then.",
    mood: "sleep",
  },
};

export type InboxViewProps = {
  orgSlug: string;
  folder: MailFolder;
  initialList: Page<MailListRowDTO>;
  initialThread: ThreadDetailDTO | null;
  senders: SenderOptionDTO[];
  canSend: boolean;
  canTrash: boolean;
  hasConnection: boolean;
  canManageConnections: boolean;
};

/**
 * Two panes on desktop (list · conversation), one pane with a back button below 1024 px.
 * Selecting a conversation updates the URL with `history.pushState` (no server round trip): the
 * conversation loads through `/api/v1/threads/[id]`, the first one comes from the Server Component.
 */
export function InboxView({
  orgSlug,
  folder,
  initialList,
  initialThread,
  senders,
  canSend,
  canTrash,
  hasConnection,
  canManageConnections,
}: InboxViewProps) {
  const pathname = usePathname();
  const selectedId = useMemo(() => {
    const segments = pathname.split("/").slice(3);
    return parseInboxSegments(segments)?.threadId ?? null;
  }, [pathname]);

  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const debounced = useDebounced(query, 250);
  const searchRef = useRef<HTMLInputElement>(null);
  const actions = useMailActions(orgSlug);

  const params: ThreadListParams = {
    orgSlug,
    folder,
    q: debounced.trim(),
    unread: folder === "inbox" && unreadOnly,
  };
  const isInitialKey = !params.q && !params.unread;
  const list = useInfiniteQuery({
    queryKey: threadListKey(params),
    queryFn: ({ pageParam }) => fetchThreadList(params, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<MailListRowDTO>) => last.nextCursor,
    initialData: isInitialKey
      ? ({ pages: [initialList], pageParams: [null] } satisfies InfiniteData<
          Page<MailListRowDTO>,
          string | null
        >)
      : undefined,
    refetchInterval: 30_000,
  });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const go = useCallback(
    (threadId: string | null) => {
      window.history.pushState(null, "", inboxHref(orgSlug, folder, threadId));
      setReplyOpen(false);
    },
    [orgSlug, folder],
  );
  const select = useCallback((row: MailListRowDTO) => row.threadId && go(row.threadId), [go]);

  // Keep the keyboard-selected row visible.
  useEffect(() => {
    document.querySelector('[data-testid="thread-list"] [aria-current="true"]')?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedId]);

  const openable = useMemo(() => rows.filter((r) => r.threadId), [rows]);
  const index = openable.findIndex((r) => r.threadId === selectedId);

  const trashSelected = useCallback(async () => {
    if (!selectedId || !canTrash) return;
    const row = rows.find((r) => r.threadId === selectedId);
    const neighbor = openable[index + 1] ?? openable[index - 1];
    const ok = await actions.trash(
      row?.kind === "email" ? { emailIds: [row.id] } : { threadIds: [selectedId] },
    );
    if (ok) go(isDesktop() && neighbor?.threadId ? neighbor.threadId : null);
  }, [selectedId, canTrash, rows, openable, index, actions, go]);

  const markUnreadSelected = useCallback(async () => {
    if (!selectedId) return;
    if (await actions.markUnread(selectedId)) {
      if (!isDesktop()) go(null);
    }
  }, [selectedId, actions, go]);

  useMailShortcuts({
    next: () => {
      const target = openable[index + 1] ?? (index === -1 ? openable[0] : undefined);
      if (target?.threadId) go(target.threadId);
    },
    prev: () => {
      const target = openable[index - 1];
      if (target?.threadId) go(target.threadId);
    },
    trash: () => void trashSelected(),
    reply: () => {
      if (selectedId && canSend) setReplyOpen(true);
    },
    unread: () => void markUnreadSelected(),
    search: () => searchRef.current?.focus(),
  });

  if (!hasConnection) {
    return (
      <EmptyState
        title="Connect Resend to start your inbox"
        mood="idle"
        action={
          canManageConnections ? (
            <Button asChild>
              <Link href={`/${orgSlug}/settings/connections`}>Connect an account</Link>
            </Button>
          ) : null
        }
      >
        {canManageConnections
          ? "Once a Resend account is connected, replies to your emails and everything you send show up here."
          : "Ask an Owner or Admin to connect a Resend account. Mail appears here as soon as they do."}
      </EmptyState>
    );
  }

  const copy = EMPTY_COPY[folder];
  const searching = !!query.trim();
  const empty = searching ? (
    <EmptyState mood="detective" mascotSize={96} title={`No results for “${query.trim()}”`}>
      Try a different word, an address, or part of the subject.
    </EmptyState>
  ) : unreadOnly ? (
    <EmptyState mood="sleep" mascotSize={96} title="Nothing unread">
      You&apos;re all caught up.
    </EmptyState>
  ) : (
    <EmptyState mood={copy.mood} mascotSize={96} title={copy.title}>
      {copy.body}
    </EmptyState>
  );

  const showThread = !!selectedId && folder !== "trash";

  return (
    <div className="flex flex-col gap-3.5">
      <h1 className="sr-only">Inbox</h1>
      <div className="flex h-[calc(100dvh-7.75rem)] min-h-[520px] overflow-hidden rounded-xl bg-surface shadow-md">
        <div
          className={cn(
            "w-full min-w-0 flex-col lg:flex lg:w-[380px] lg:flex-none lg:border-r lg:border-line",
            showThread ? "hidden" : "flex",
          )}
        >
          <ThreadList
            orgSlug={orgSlug}
            folder={folder}
            rows={rows}
            selectedId={selectedId}
            query={query}
            onQuery={setQuery}
            unreadOnly={unreadOnly}
            onUnreadOnly={setUnreadOnly}
            searchRef={searchRef}
            loading={list.isPending}
            error={list.isError}
            hasNext={!!list.hasNextPage}
            fetchingNext={list.isFetchingNextPage}
            onFetchNext={() => void list.fetchNextPage()}
            onSelect={select}
            onRestore={(row) =>
              void actions.restore(
                row.kind === "email" ? { emailIds: [row.id] } : { threadIds: [row.id] },
              )
            }
            empty={empty}
          />
        </div>
        <div className={cn("min-w-0 flex-1 flex-col lg:flex", showThread ? "flex" : "hidden")}>
          {showThread ? (
            <ThreadView
              key={selectedId}
              orgSlug={orgSlug}
              threadId={selectedId}
              initialThread={initialThread}
              senders={senders}
              canSend={canSend}
              canTrash={canTrash}
              replyOpen={replyOpen}
              onReplyOpenChange={setReplyOpen}
              onBack={() => go(null)}
              onTrash={() => void trashSelected()}
              onMarkUnread={() => void markUnreadSelected()}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-ink-muted">
              <div className="grid justify-items-center gap-2">
                <InboxGlyph aria-hidden className="size-8 text-ink-faint" />
                <p className="font-semibold text-ink-secondary">
                  {folder === "trash"
                    ? "Restore a conversation to read it"
                    : "Select a conversation"}
                </p>
                <p className="max-w-[36ch] text-sm">
                  Use <kbd className="font-sans font-semibold">j</kbd> and{" "}
                  <kbd className="font-sans font-semibold">k</kbd> to move,{" "}
                  <kbd className="font-sans font-semibold">r</kbd> to reply,{" "}
                  <kbd className="font-sans font-semibold">e</kbd> to move to Trash.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
