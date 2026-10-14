import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { PreviewFrame } from "@/components/composer/preview-frame";
import {
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import {
  cancelBroadcast,
  createBroadcast,
  deleteBroadcast,
  refreshBroadcast,
  sendBroadcast,
  sendBroadcastTest,
  updateBroadcast,
} from "@/lib/actions";
import {
  getBroadcast,
  getBroadcastOptions,
  type BroadcastDetail,
  type BroadcastFormOptions,
} from "@/lib/api";
import { previewMergeTags } from "@/lib/mail/template-vars";

const HtmlEditor = lazy(() => import("@/components/composer/html-editor"));

const STARTER_HTML = `<p>Hi {{{FIRST_NAME|there}}},</p>
<p>Write your message here.</p>
<p style="color:#6b6b6b;font-size:12px">You are receiving this because you subscribed. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></p>`;

function firstWritable(connections: BroadcastFormOptions["connections"]) {
  return connections.find((c) => c.writable)?.id ?? connections[0]?.id ?? "";
}

function EditorForm({
  orgSlug,
  broadcast,
  options,
  canSend,
}: {
  orgSlug: string;
  broadcast: BroadcastDetail | null;
  options: BroadcastFormOptions;
  canSend: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = broadcast === null;
  const isDraft = isNew || broadcast.status === "draft";

  const [connectionId, setConnectionId] = useState(
    broadcast?.connectionId ?? firstWritable(options.connections),
  );
  const [name, setName] = useState(
    broadcast?.name === "Untitled broadcast" ? "" : (broadcast?.name ?? ""),
  );
  const [senderId, setSenderId] = useState(broadcast?.senderId ?? "");
  const [segmentId, setSegmentId] = useState(broadcast?.segmentId ?? "");
  const [topicId, setTopicId] = useState(broadcast?.topicId ?? "");
  const [subject, setSubject] = useState(broadcast?.subject ?? "");
  const [previewText, setPreviewText] = useState(broadcast?.previewText ?? "");
  const [html, setHtml] = useState(broadcast?.html ?? STARTER_HTML);
  const [templateId, setTemplateId] = useState(broadcast?.templateId ?? "");
  const [version, setVersion] = useState(broadcast?.version ?? 0);
  const [scheduleAt, setScheduleAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const senders = options.senders.filter((s) => s.connectionId === connectionId);
  const segments = options.segments.filter((s) => s.connectionId === connectionId);
  const topics = options.topics.filter((t) => t.connectionId === connectionId);
  const templates = options.templates.filter((t) => t.connectionId === connectionId);
  const editable = isDraft && (isNew || !!broadcast?.writable);

  useEffect(() => {
    if (!senderId && senders[0]) setSenderId(senders.find((s) => !s.problem)?.id ?? senders[0].id);
  }, [senders, senderId]);
  useEffect(() => {
    if (!segmentId && segments[0]) setSegmentId(segments[0].id);
  }, [segments, segmentId]);

  const previewHtml = useMemo(() => previewMergeTags(html.trim() ? html : ""), [html]);

  const invalidate = async (id?: string) => {
    await queryClient.invalidateQueries({ queryKey: ["broadcasts", orgSlug] });
    if (id) await queryClient.invalidateQueries({ queryKey: ["broadcast", orgSlug, id] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim() || "Untitled broadcast",
        segmentId,
        senderId,
        subject,
        previewText,
        topicId: topicId || null,
        html,
        templateId: templateId || null,
      };
      if (isNew) {
        return createBroadcast(orgSlug, { connectionId, ...body });
      }
      return updateBroadcast(orgSlug, { id: broadcast!.id, version, ...body });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      const data = result.data as BroadcastDetail;
      setVersion(data.version);
      await invalidate(data.id);
      if (isNew) {
        await navigate({
          to: "/$orgSlug/broadcasts/$broadcastId",
          params: { orgSlug, broadcastId: data.id },
        });
      }
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!broadcast) throw new Error("Save first");
      return sendBroadcast(orgSlug, broadcast.id, scheduleAt || undefined);
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await invalidate(broadcast!.id);
    },
  });

  const test = useMutation({
    mutationFn: () => sendBroadcastTest(orgSlug, broadcast!.id),
    onSuccess: async (result) => {
      if (!result.ok) setError(result.error.message);
      else setError(null);
    },
  });

  const cancel = useMutation({
    mutationFn: () => cancelBroadcast(orgSlug, broadcast!.id),
    onSuccess: async (result) => {
      if (!result.ok) setError(result.error.message);
      else {
        setError(null);
        await invalidate(broadcast!.id);
      }
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteBroadcast(orgSlug, broadcast!.id),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await invalidate();
      await navigate({ to: "/$orgSlug/broadcasts", params: { orgSlug } });
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        {!isNew && broadcast ? (
          <p className="text-xs font-medium text-ink-muted">
            Status: <span className="text-ink">{broadcast.status}</span>
            {broadcast.warnings.length
              ? ` · ${broadcast.warnings.join(" · ")}`
              : ""}
          </p>
        ) : null}

        {isNew && options.connections.filter((c) => c.writable).length > 1 ? (
          <label className="grid gap-1 text-xs font-medium">
            Connection
            <select
              value={connectionId}
              disabled={!editable}
              onChange={(e) => {
                setConnectionId(e.target.value);
                setSenderId("");
                setSegmentId("");
                setTopicId("");
                setTemplateId("");
              }}
              className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
            >
              {options.connections
                .filter((c) => c.writable)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}

        <label className="grid gap-1 text-xs font-medium">
          Name
          <input
            value={name}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
            placeholder="March newsletter"
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm disabled:opacity-60"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium">
            From
            <select
              required
              value={senderId}
              disabled={!editable}
              onChange={(e) => setSenderId(e.target.value)}
              className="h-9 rounded-control border border-line bg-canvas px-2 text-sm disabled:opacity-60"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id} disabled={!!s.problem}>
                  {s.displayName ? `${s.displayName} <${s.address}>` : s.address}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Segment
            <select
              required
              value={segmentId}
              disabled={!editable}
              onChange={(e) => setSegmentId(e.target.value)}
              className="h-9 rounded-control border border-line bg-canvas px-2 text-sm disabled:opacity-60"
            >
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.contactCount})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium">
            Topic (optional)
            <select
              value={topicId}
              disabled={!editable}
              onChange={(e) => setTopicId(e.target.value)}
              className="h-9 rounded-control border border-line bg-canvas px-2 text-sm disabled:opacity-60"
            >
              <option value="">None</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Start from template
            <select
              value={templateId}
              disabled={!editable}
              onChange={(e) => {
                const id = e.target.value;
                setTemplateId(id);
                const t = templates.find((x) => x.id === id);
                if (t) {
                  setHtml(t.html);
                  if (t.subject) setSubject(t.subject);
                }
              }}
              className="h-9 rounded-control border border-line bg-canvas px-2 text-sm disabled:opacity-60"
            >
              <option value="">Blank</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-1 text-xs font-medium">
          Subject
          <input
            required
            value={subject}
            disabled={!editable}
            onChange={(e) => setSubject(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm disabled:opacity-60"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Preview text
          <input
            value={previewText}
            disabled={!editable}
            onChange={(e) => setPreviewText(e.target.value)}
            className="h-9 rounded-control border border-line bg-canvas px-3 text-sm disabled:opacity-60"
          />
        </label>

        <div className="grid gap-1">
          <p className="text-xs font-medium">HTML</p>
          <div className="min-h-[280px] overflow-hidden rounded-control border border-line bg-canvas">
            {editable ? (
              <Suspense fallback={<p className="p-3 text-sm text-ink-muted">Loading editor…</p>}>
                <HtmlEditor value={html} onChange={setHtml} />
              </Suspense>
            ) : (
              <pre className="max-h-[320px] overflow-auto p-3 text-xs whitespace-pre-wrap">{html}</pre>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {editable ? (
            <button
              type="submit"
              disabled={save.isPending || !segmentId || !senderId}
              className="h-9 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : isNew ? "Create draft" : "Save"}
            </button>
          ) : null}
          {!isNew && isDraft && canSend ? (
            <>
              <button
                type="button"
                disabled={test.isPending || save.isPending}
                onClick={() => test.mutate()}
                className="h-9 rounded-control border border-line px-3 text-sm font-medium"
              >
                Send test
              </button>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="h-9 rounded-control border border-line bg-canvas px-2 text-xs"
                aria-label="Schedule for"
              />
              <button
                type="button"
                disabled={send.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      scheduleAt
                        ? `Schedule this broadcast for ${scheduleAt}?`
                        : "Send this broadcast now?",
                    )
                  ) {
                    send.mutate();
                  }
                }}
                className="h-9 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                {send.isPending ? "Sending…" : scheduleAt ? "Schedule" : "Send now"}
              </button>
            </>
          ) : null}
          {!isNew && broadcast?.status === "scheduled" && canSend ? (
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
              className="h-9 rounded-control border border-line px-3 text-sm font-medium"
            >
              Cancel schedule
            </button>
          ) : null}
          {!isNew ? (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm("Delete this broadcast?")) remove.mutate();
              }}
              className="h-9 rounded-control border border-line px-3 text-sm font-medium text-danger-ink hover:bg-danger-soft"
            >
              Delete
            </button>
          ) : null}
        </div>
      </form>

      <aside className="grid gap-3 self-start">
        <div className="rounded-lg border border-line bg-surface p-2">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Preview
          </p>
          <PreviewFrame html={previewHtml} title="Broadcast preview" className="min-h-[360px]" />
        </div>
        {broadcast?.stats ? (
          <div className="rounded-lg border border-line bg-surface p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Results</p>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <dt className="text-ink-muted">Recipients</dt>
                <dd className="font-semibold">{broadcast.stats.recipients}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Delivered</dt>
                <dd className="font-semibold">{broadcast.stats.delivered}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Opened</dt>
                <dd className="font-semibold">{broadcast.stats.opened}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Clicked</dt>
                <dd className="font-semibold">{broadcast.stats.clicked}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function BroadcastNewPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const options = useQuery({
    queryKey: ["broadcast-options", orgSlug],
    queryFn: () => getBroadcastOptions(orgSlug),
  });

  return (
    <ResourcePage
      title="New broadcast"
      description="Pick who gets it, write it, preview it. Nothing is sent until you say so."
    >
      <Link
        to="/$orgSlug/broadcasts"
        params={{ orgSlug }}
        className="text-sm font-medium text-accent-fill hover:underline"
      >
        ← Broadcasts
      </Link>
      {options.isPending ? (
        <ResourcePending />
      ) : options.isError ? (
        <ResourceError message="Could not load editor options." />
      ) : (
        <EditorForm
          orgSlug={orgSlug}
          broadcast={null}
          options={options.data}
          canSend
        />
      )}
    </ResourcePage>
  );
}

export function BroadcastDetailPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const { broadcastId } = useParams({ strict: false }) as { broadcastId: string };
  const queryClient = useQueryClient();

  const options = useQuery({
    queryKey: ["broadcast-options", orgSlug],
    queryFn: () => getBroadcastOptions(orgSlug),
  });
  const broadcast = useQuery({
    queryKey: ["broadcast", orgSlug, broadcastId],
    queryFn: () => getBroadcast(orgSlug, broadcastId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "queued" || status === "sending" ? 8000 : false;
    },
  });

  useEffect(() => {
    const status = broadcast.data?.status;
    if (status !== "queued" && status !== "sending" && status !== "scheduled") return;
    const id = setInterval(() => {
      void refreshBroadcast(orgSlug, broadcastId).then((result) => {
        if (result.ok) {
          void queryClient.invalidateQueries({ queryKey: ["broadcast", orgSlug, broadcastId] });
        }
      });
    }, 8000);
    return () => clearInterval(id);
  }, [broadcast.data?.status, orgSlug, broadcastId, queryClient]);

  return (
    <ResourcePage
      title={broadcast.data?.name || "Broadcast"}
      description={broadcast.data?.subject || "`GET /api/v1/broadcasts/:id`"}
    >
      {broadcast.data ? (
        <BreadcrumbLabel segment={broadcastId} label={broadcast.data.name} />
      ) : null}
      <Link
        to="/$orgSlug/broadcasts"
        params={{ orgSlug }}
        className="text-sm font-medium text-accent-fill hover:underline"
      >
        ← Broadcasts
      </Link>
      {broadcast.isPending || options.isPending ? (
        <ResourcePending />
      ) : broadcast.isError || options.isError || !broadcast.data || !options.data ? (
        <ResourceError message="Could not load this broadcast." />
      ) : (
        <EditorForm
          orgSlug={orgSlug}
          broadcast={broadcast.data}
          options={options.data}
          canSend
        />
      )}
    </ResourcePage>
  );
}
