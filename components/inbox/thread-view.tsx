"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MailOpen, Reply } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { TrashIcon } from "@/components/icons/animated";
import type { SenderOptionDTO } from "@/components/composer/composer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MessageDTO, ThreadDetailDTO } from "@/lib/dto/mail";
import { useLiveFallbackInterval, useLiveQuery } from "@/lib/realtime/use-live-query";
import { topics } from "@/lib/realtime/topics";
import { ApiError, fetchThread, threadKey } from "./api";
import { MessageCard } from "./message-card";
import { ReplyBox } from "./reply-box";
import { useMailActions } from "./use-mail-actions";

/** "Re: Invoice question", without stacking prefixes. */
export const replySubject = (subject: string) =>
  /^\s*re:/i.test(subject) ? subject : `Re: ${subject || "(no subject)"}`;

/** Replies go to the latest message from the other side; a follow-up to our own message goes to its recipients. */
export function replyTarget(messages: MessageDTO[]) {
  const last = [...messages].reverse().find((m) => m.direction === "inbound") ?? messages.at(-1);
  if (!last) return null;
  return {
    inReplyToEmailId: last.id,
    to: last.direction === "inbound" ? [last.from.address] : last.to.map((a) => a.address),
  };
}

export function ThreadView({
  orgSlug,
  threadId,
  initialThread,
  senders,
  canSend,
  canTrash,
  replyOpen,
  onReplyOpenChange,
  onBack,
  onTrash,
  onMarkUnread,
}: {
  orgSlug: string;
  threadId: string;
  initialThread: ThreadDetailDTO | null;
  senders: SenderOptionDTO[];
  canSend: boolean;
  canTrash: boolean;
  replyOpen: boolean;
  onReplyOpenChange: (open: boolean) => void;
  onBack: () => void;
  onTrash: () => void;
  onMarkUnread: () => void;
}) {
  const queryClient = useQueryClient();
  const actions = useMailActions(orgSlug);
  const fallback = useLiveFallbackInterval();
  const query = useLiveQuery({
    queryKey: threadKey(orgSlug, threadId),
    topics: [topics.thread(threadId)],
    queryFn: () => fetchThread(orgSlug, threadId),
    initialData: initialThread?.id === threadId ? initialThread : undefined,
    // Bodies of new mail arrive a few seconds after the row does (fetch-inbound job).
    refetchInterval: (q) =>
      q.state.data?.messages.some((m) => m.contentStatus === "pending") ? 3000 : fallback,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
  const thread = query.data;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const replyRef = useRef<HTMLDivElement>(null);

  // Opening a conversation that was unread marks it read, once. Later "mark unread" by the member
  // must stick, so only the state seen when the conversation first loads counts.
  const openedUnread = useRef<boolean | null>(null);
  useEffect(() => {
    if (!thread) return;
    if (openedUnread.current === null) {
      openedUnread.current = thread.unread;
      if (thread.unread) void actions.markRead(threadId);
    }
  }, [thread, threadId, actions]);

  useEffect(() => {
    if (replyOpen) replyRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [replyOpen]);

  const target = useMemo(() => (thread ? replyTarget(thread.messages) : null), [thread]);
  const lastId = thread?.messages.at(-1)?.id;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={onBack} className="lg:hidden">
        <ArrowLeft aria-hidden /> Back
      </Button>
      <div className="ml-auto flex items-center gap-1">
        {canSend && target ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onReplyOpenChange(true)}>
            <Reply aria-hidden /> <span className="sr-only sm:not-sr-only">Reply</span>
            <kbd className="hidden font-sans text-[11px] font-medium text-ink-faint lg:inline">
              r
            </kbd>
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onMarkUnread}>
          <MailOpen aria-hidden /> <span className="sr-only sm:not-sr-only">Mark unread</span>
          <kbd className="hidden font-sans text-[11px] font-medium text-ink-faint lg:inline">u</kbd>
        </Button>
        {canTrash ? (
          <Button type="button" variant="ghost" size="sm" onClick={onTrash}>
            <TrashIcon aria-hidden size={16} />{" "}
            <span className="sr-only sm:not-sr-only">Trash</span>
            <kbd className="hidden font-sans text-[11px] font-medium text-ink-faint lg:inline">
              e
            </kbd>
          </Button>
        ) : null}
      </div>
    </div>
  );

  if (query.isError && !thread) {
    const gone = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="grid gap-3 p-4">
        {toolbar}
        <p role="alert" className="text-ink-muted">
          {gone
            ? "This conversation isn't available. It may have been moved to Trash or you may not have access."
            : "We couldn't load this conversation. Try again in a moment."}
        </p>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="grid gap-3 p-4" aria-busy="true" aria-label="Loading conversation">
        {toolbar}
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="thread-view">
      <BreadcrumbLabel segment={threadId} label={thread.subject || "(no subject)"} />
      <div className="grid gap-2 border-b border-line px-4 py-3">
        {toolbar}
        <h2 className="text-base font-bold tracking-[-0.01em] [text-wrap:balance]">
          {thread.subject || "(no subject)"}
        </h2>
        <p className="text-xs text-ink-muted">
          {thread.messageCount} {thread.messageCount === 1 ? "message" : "messages"} ·{" "}
          {thread.participants.join(", ")}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto grid max-w-[68ch] gap-3 min-[1280px]:max-w-[76ch]">
          {thread.messages.length === 0 ? (
            <p className="text-sm text-ink-muted">No messages in this conversation.</p>
          ) : null}
          {thread.messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              orgSlug={orgSlug}
              expanded={open[message.id] ?? message.id === lastId}
              onToggle={() =>
                setOpen((prev) => ({
                  ...prev,
                  [message.id]: !(prev[message.id] ?? message.id === lastId),
                }))
              }
              onRetried={() =>
                void queryClient.invalidateQueries({ queryKey: threadKey(orgSlug, threadId) })
              }
            />
          ))}
          {canSend && target ? (
            <div ref={replyRef}>
              <ReplyBox
                orgSlug={orgSlug}
                senders={senders}
                canSend={canSend}
                open={replyOpen}
                onOpenChange={onReplyOpenChange}
                reply={{
                  threadId: thread.id,
                  inReplyToEmailId: target.inReplyToEmailId,
                  to: target.to,
                  subject: replySubject(thread.subject),
                }}
                onSent={() => {
                  onReplyOpenChange(false);
                  void queryClient.invalidateQueries({ queryKey: threadKey(orgSlug, threadId) });
                  void queryClient.invalidateQueries({ queryKey: ["threads", orgSlug] });
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
