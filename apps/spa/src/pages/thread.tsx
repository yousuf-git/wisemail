import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

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

function formatFrom(from: { address: string; name?: string }) {
  return from.name ? `${from.name} <${from.address}>` : from.address;
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainToHtml(body: string) {
  return `<p>${body
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br/>")}</p>`;
}

export function ThreadPage() {
  const { orgSlug, threadId } = useParams({ from: "/$orgSlug/inbox/$threadId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [tone, setTone] = useState<"friendly" | "professional" | "concise" | "empathetic">(
    "friendly",
  );

  const thread = useQuery({
    queryKey: ["thread", orgSlug, threadId],
    queryFn: () => getThread(orgSlug, threadId),
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
    const active = (senders.data ?? []).filter((s) => s.status === "active");
    return active.find((s) => s.isDefault)?.id ?? active[0]?.id ?? "";
  }, [senders.data]);

  const lastInbound = useMemo(() => {
    const msgs = thread.data?.messages ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]!.direction === "inbound") return msgs[i]!;
    }
    return msgs[msgs.length - 1] ?? null;
  }, [thread.data]);

  useEffect(() => {
    if (thread.data?.unread) {
      void markThreadRead(orgSlug, threadId).then(() =>
        queryClient.invalidateQueries({ queryKey: ["threads", orgSlug, "inbox"] }),
      );
    }
  }, [thread.data?.unread, orgSlug, threadId, queryClient]);

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
      if (!lastInbound || !senderId) throw new Error("Missing sender or message.");
      const subject = thread.data?.subject?.startsWith("Re:")
        ? thread.data.subject
        : `Re: ${thread.data?.subject || ""}`;
      return sendEmail(orgSlug, {
        senderId,
        to: [lastInbound.from.address],
        subject,
        text: reply,
        html: plainToHtml(reply),
        inReplyToEmailId: lastInbound.id,
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setReply("");
      await queryClient.invalidateQueries({ queryKey: ["thread", orgSlug, threadId] });
    },
    onError: (e: Error) => setError(e.message || "Could not send the reply."),
  });

  const draft = useMutation({
    mutationFn: () => aiDraftReply(orgSlug, { threadId, tone }),
    onSuccess: (result) => {
      setError(null);
      setReply(result.text);
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
        <ol className="grid gap-3">
          {thread.data.messages.map((msg) => (
            <li key={msg.id} className="grid gap-2 rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{formatFrom(msg.from)}</p>
                <time className="text-xs text-ink-faint">{new Date(msg.at).toLocaleString()}</time>
              </div>
              <p className="text-xs text-ink-muted">
                {msg.direction} · {msg.status}
                {msg.to.length
                  ? ` · to ${msg.to.map((a) => a.name || a.address).join(", ")}`
                  : ""}
              </p>
              {msg.html ? (
                <div
                  className="prose prose-sm max-w-none text-ink [&_a]:text-accent-fill"
                  dangerouslySetInnerHTML={{ __html: msg.html }}
                />
              ) : msg.text ? (
                <pre className="whitespace-pre-wrap font-sans text-sm text-ink">{msg.text}</pre>
              ) : (
                <p className="text-sm text-ink-muted">{msg.snippet || "No body yet."}</p>
              )}
            </li>
          ))}
        </ol>
      )}

      {thread.data && lastInbound && senderId ? (
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
            {aiDraftOk ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={tone}
                  onChange={(e) =>
                    setTone(e.target.value as typeof tone)
                  }
                  className="h-8 rounded-control border border-line bg-canvas px-2 text-xs"
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
                  className="h-8 rounded-control border border-line px-2.5 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
                >
                  {draft.isPending ? "Drafting…" : "AI draft"}
                </button>
              </div>
            ) : null}
          </div>
          <p className="text-xs text-ink-muted">
            To {lastInbound.from.address}
            {ai.data && !aiDraftOk
              ? ` · AI drafts unavailable (${ai.data.planLabel})`
              : ""}
          </p>
          <textarea
            required
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="min-h-28 rounded-control border border-line-strong bg-canvas px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            placeholder="Write a reply…"
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
      ) : null}
    </ResourcePage>
  );
}
