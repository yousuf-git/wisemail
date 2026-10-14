import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { MessageCard } from "@/components/inbox/message-card";
import { TriageSummary } from "@/components/inbox/triage-chip";
import {
  ResourceEmpty,
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import {
  markThreadRead,
  markThreadUnread,
  sendEmail,
  trashThreads,
} from "@/lib/actions";
import { aiDraftReply, getAiStatus, getThread, listSenders } from "@/lib/api";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainToHtml(body: string) {
  return `<p>${body
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br/>")}</p>`;
}

function replySubject(subject: string) {
  return /^\s*re:/i.test(subject) ? subject : `Re: ${subject || "(no subject)"}`;
}

function replyTarget(messages: { id: string; direction: string; from: { address: string }; to: { address: string }[] }[]) {
  const last = [...messages].reverse().find((m) => m.direction === "inbound") ?? messages.at(-1);
  if (!last) return null;
  return {
    inReplyToEmailId: last.id,
    to: last.direction === "inbound" ? [last.from.address] : last.to.map((a) => a.address),
  };
}

export function ThreadPage() {
  const { orgSlug, threadId } = useParams({ from: "/$orgSlug/inbox/$threadId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyOpen, setReplyOpen] = useState(false);
  const [tone, setTone] = useState<"friendly" | "professional" | "concise" | "empathetic">(
    "friendly",
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const replyRef = useRef<HTMLDivElement>(null);

  const thread = useQuery({
    queryKey: ["thread", orgSlug, threadId],
    queryFn: () => getThread(orgSlug, threadId),
    refetchInterval: (q) =>
      q.state.data?.messages.some((m) => m.contentStatus === "pending") ? 3000 : false,
  });
  const senders = useQuery({
    queryKey: ["senders", orgSlug],
    queryFn: () => listSenders(orgSlug),
  });
  const ai = useQuery({
    queryKey: ["ai-status", orgSlug],
    queryFn: () => getAiStatus(orgSlug),
  });

  const senderId = useMemo(() => {
    const active = (senders.data?.senders ?? []).filter((s) => s.status === "active");
    return active.find((s) => s.isDefault)?.id ?? active[0]?.id ?? "";
  }, [senders.data]);

  const target = useMemo(
    () => (thread.data ? replyTarget(thread.data.messages) : null),
    [thread.data],
  );

  const lastId = thread.data?.messages.at(-1)?.id;

  useEffect(() => {
    if (!thread.data) return;
    setOpen((prev) => {
      const next = { ...prev };
      for (const msg of thread.data.messages) {
        if (next[msg.id] === undefined) next[msg.id] = msg.id === lastId;
      }
      return next;
    });
  }, [thread.data, lastId]);

  const openedUnread = useRef<boolean | null>(null);
  useEffect(() => {
    if (!thread.data) return;
    if (openedUnread.current === null) {
      openedUnread.current = thread.data.unread;
      if (thread.data.unread) {
        void markThreadRead(orgSlug, threadId).then(() =>
          queryClient.invalidateQueries({ queryKey: ["threads", orgSlug, "inbox"] }),
        );
      }
    }
  }, [thread.data, orgSlug, threadId, queryClient]);

  useEffect(() => {
    if (replyOpen) replyRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [replyOpen]);

  const trash = useMutation({
    mutationFn: () => trashThreads(orgSlug, [threadId]),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["threads", orgSlug] });
      await navigate({ to: "/$orgSlug/inbox", params: { orgSlug } });
    },
    onError: () => setError("Could not move to trash."),
  });

  const unread = useMutation({
    mutationFn: () => markThreadUnread(orgSlug, threadId),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["thread", orgSlug, threadId] });
      await queryClient.invalidateQueries({ queryKey: ["threads", orgSlug, "inbox"] });
    },
  });

  const sendReply = useMutation({
    mutationFn: () => {
      if (!target || !senderId) throw new Error("Missing sender or message.");
      return sendEmail(orgSlug, {
        senderId,
        to: target.to,
        subject: replySubject(thread.data?.subject ?? ""),
        text: reply,
        html: plainToHtml(reply),
        inReplyToEmailId: target.inReplyToEmailId,
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setReply("");
      setReplyOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["thread", orgSlug, threadId] });
    },
    onError: (e: Error) => setError(e.message || "Could not send the reply."),
  });

  const draft = useMutation({
    mutationFn: () => aiDraftReply(orgSlug, { threadId, tone }),
    onSuccess: (result) => {
      setError(null);
      setReply(result.text);
      setReplyOpen(true);
    },
    onError: (e: Error) => setError(e.message || "AI draft failed."),
  });

  const aiDraftOk =
    ai.data?.planIncluded &&
    ai.data.enabled &&
    ai.data.canUse &&
    ai.data.features.drafts &&
    (ai.data.credits.available ?? 0) > 0;

  return (
    <ResourcePage
      title={thread.data?.subject || "Thread"}
      description={
        thread.data
          ? `${thread.data.messageCount} messages · ${thread.data.mailboxAddress}`
          : "`GET /api/v1/threads/:id`"
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/$orgSlug/inbox"
          params={{ orgSlug }}
          className="text-sm font-medium text-accent-fill hover:underline"
        >
          ← Inbox
        </Link>
        <button
          type="button"
          disabled={unread.isPending}
          onClick={() => unread.mutate()}
          className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
        >
          Mark unread
        </button>
        {target && senderId ? (
          <button
            type="button"
            onClick={() => setReplyOpen(true)}
            className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken"
          >
            Reply
          </button>
        ) : null}
        {aiDraftOk && target ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as typeof tone)}
              className="h-7 rounded-control border border-line bg-canvas px-2 text-xs"
            >
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="concise">Concise</option>
              <option value="empathetic">Empathetic</option>
            </select>
            <button
              type="button"
              disabled={draft.isPending}
              onClick={() => draft.mutate()}
              className="rounded-control border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
            >
              {draft.isPending ? "Drafting…" : "AI draft"}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          disabled={trash.isPending}
          onClick={() => {
            if (window.confirm("Move this thread to trash?")) trash.mutate();
          }}
          className="rounded-control border border-line px-2.5 py-1 text-xs font-medium text-danger-ink hover:bg-danger-soft disabled:opacity-50"
        >
          Trash
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      {thread.isPending ? (
        <ResourcePending />
      ) : thread.isError ? (
        <ResourceError message="Could not load this thread." />
      ) : thread.data.messages.length === 0 ? (
        <ResourceEmpty>No messages in this thread.</ResourceEmpty>
      ) : (
        <div className="grid gap-3">
          {thread.data.ai ? <TriageSummary ai={thread.data.ai} /> : null}
          <ol className="grid gap-2">
            {thread.data.messages.map((msg) => (
              <li key={msg.id}>
                <MessageCard
                  message={msg}
                  orgSlug={orgSlug}
                  expanded={open[msg.id] ?? msg.id === lastId}
                  onToggle={() => setOpen((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                  onRetried={() =>
                    void queryClient.invalidateQueries({ queryKey: ["thread", orgSlug, threadId] })
                  }
                />
              </li>
            ))}
          </ol>
        </div>
      )}

      {thread.data && target && senderId ? (
        <div ref={replyRef} className="grid gap-2">
          {!replyOpen ? (
            <button
              type="button"
              onClick={() => setReplyOpen(true)}
              className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-left text-sm text-ink-muted hover:bg-canvas-sunken"
            >
              Reply to {target.to[0] ?? "this conversation"}…
            </button>
          ) : (
            <form
              className="grid gap-3 rounded-lg border border-line bg-surface p-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                sendReply.mutate();
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Reply</h2>
                <button
                  type="button"
                  onClick={() => {
                    setReplyOpen(false);
                    setReply("");
                  }}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  Discard
                </button>
              </div>
              <p className="text-xs text-ink-muted">
                To {target.to.join(", ")}
                {ai.data && !aiDraftOk ? ` · AI drafts unavailable (${ai.data.planLabel})` : ""}
              </p>
              <textarea
                required
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                className="min-h-28 rounded-control border border-line-strong bg-canvas px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                placeholder="Write a reply…"
                autoFocus
              />
              <div>
                <button
                  type="submit"
                  disabled={sendReply.isPending || !reply.trim()}
                  className="h-9 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-50"
                >
                  {sendReply.isPending ? "Sending…" : "Send reply"}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </ResourcePage>
  );
}
