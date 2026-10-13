import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import {
  confirmAttachmentUpload,
  removeDraftAttachment,
  saveDraft,
  sendEmail,
  startAttachmentUpload,
} from "@/lib/actions";
import {
  aiComposeAssist,
  getAiStatus,
  listSenders,
  sameOriginUploadUrl,
} from "@/lib/api";

function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
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

function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

type Attached = { id: string; filename: string; size: number };

export function ComposePage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/compose" });
  const navigate = useNavigate();
  const senders = useQuery({
    queryKey: ["senders", orgSlug],
    queryFn: () => listSenders(orgSlug),
  });
  const ai = useQuery({
    queryKey: ["ai-status", orgSlug],
    queryFn: () => getAiStatus(orgSlug),
  });

  const activeSenders = useMemo(
    () => (senders.data ?? []).filter((s) => s.status === "active"),
    [senders.data],
  );
  const defaultSenderId =
    activeSenders.find((s) => s.isDefault)?.id ?? activeSenders[0]?.id ?? "";

  const [senderId, setSenderId] = useState(defaultSenderId);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [mode, setMode] = useState<"text" | "html">("text");
  const [body, setBody] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [subjectIdeas, setSubjectIdeas] = useState<string[]>([]);
  const [tone, setTone] = useState<"friendly" | "professional" | "concise" | "empathetic">(
    "friendly",
  );
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | undefined>(undefined);
  const [attachments, setAttachments] = useState<Attached[]>([]);
  const [uploading, setUploading] = useState(false);

  const effectiveSenderId = senderId || defaultSenderId;
  const bodyHtmlForAi = mode === "html" ? body : plainToHtml(body);

  const aiComposeOk =
    ai.data?.planIncluded &&
    ai.data.enabled &&
    ai.data.canUse &&
    ai.data.features.compose &&
    (ai.data.credits.available ?? 0) > 0;

  async function ensureDraft(): Promise<{ id: string; version: number }> {
    if (draftId && draftVersion !== undefined) return { id: draftId, version: draftVersion };
    const result = await saveDraft(orgSlug, {
      senderId: effectiveSenderId || null,
      to: splitAddresses(to),
      subject,
      bodyHtml: mode === "html" ? body : plainToHtml(body),
      bodyText: mode === "html" ? undefined : body,
      mode: mode === "html" ? "html" : "rich",
    });
    if (!result.ok) throw new Error(result.error.message);
    setDraftId(result.data.id);
    setDraftVersion(result.data.version);
    return result.data;
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const draft = await ensureDraft();
      for (const file of Array.from(files)) {
        const started = await startAttachmentUpload(orgSlug, {
          draftId: draft.id,
          filename: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        });
        if (!started.ok) throw new Error(started.error.message);
        const uploadUrl = sameOriginUploadUrl(started.data.uploadUrl);
        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: started.data.headers,
          body: file,
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
        const confirmed = await confirmAttachmentUpload(orgSlug, {
          draftId: draft.id,
          attachmentId: started.data.attachmentId,
        });
        if (!confirmed.ok) throw new Error(confirmed.error.message);
        setAttachments((prev) => [
          ...prev,
          { id: started.data.attachmentId, filename: file.name, size: file.size },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Attachment upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const send = useMutation({
    mutationFn: () => {
      const html = mode === "html" ? body : plainToHtml(body);
      const text = mode === "html" ? undefined : body;
      return sendEmail(orgSlug, {
        senderId: effectiveSenderId,
        to: splitAddresses(to),
        cc: splitAddresses(cc),
        bcc: splitAddresses(bcc),
        subject,
        html,
        text,
        scheduledAt: schedule ? localInputToIso(scheduledAt) : undefined,
        attachmentIds: attachments.map((a) => a.id),
        draftId: draftId ?? undefined,
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      await navigate({
        to: schedule ? "/$orgSlug/scheduled" : "/$orgSlug/inbox",
        params: { orgSlug },
      });
    },
  });

  const assist = useMutation({
    mutationFn: (action: "subjects" | "rewrite" | "shorten" | "grammar") =>
      aiComposeAssist(orgSlug, {
        action,
        subject,
        bodyHtml: bodyHtmlForAi,
        tone: action === "rewrite" ? tone : undefined,
      }),
    onSuccess: (result) => {
      setError(null);
      if (result.kind === "subjects") {
        setSubjectIdeas(result.suggestions);
        return;
      }
      if (mode === "html") setBody(result.html);
      else setBody(result.text);
    },
    onError: (e: Error) => setError(e.message || "AI assist failed."),
  });

  const removeAtt = useMutation({
    mutationFn: async (attachmentId: string) => {
      if (!draftId) return { ok: true as const, data: { id: attachmentId } };
      return removeDraftAttachment(orgSlug, { draftId, attachmentId });
    },
    onSuccess: (result, attachmentId) => {
      if (result && "ok" in result && !result.ok) {
        setError(result.error.message);
        return;
      }
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    },
  });

  if (senders.isPending) {
    return <p className="text-sm text-ink-muted">Loading senders…</p>;
  }

  if (senders.isError) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
        Could not load senders. Check permission and API.
      </p>
    );
  }

  if (activeSenders.length === 0) {
    return (
      <section className="grid max-w-lg gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Compose</h1>
        <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-sm text-ink-muted">
          No active senders yet. Add one under Settings → Senders (or sync a connection).
        </p>
        <Link
          to="/$orgSlug/settings/senders"
          params={{ orgSlug }}
          className="text-sm font-medium text-accent-fill hover:underline"
        >
          Go to senders
        </Link>
      </section>
    );
  }

  return (
    <section className="grid max-w-2xl gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Compose</h1>
        <p className="text-sm text-ink-muted">
          Plain/HTML · schedule · attachments · AI helpers
        </p>
      </header>
      <form
        className="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          send.mutate();
        }}
        noValidate
      >
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <label className="grid gap-1.5 text-sm font-medium">
          From
          <select
            className="h-10 rounded-control border border-line-strong bg-canvas px-3"
            value={effectiveSenderId}
            onChange={(e) => setSenderId(e.target.value)}
          >
            {activeSenders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName ? `${s.displayName} <${s.address}>` : s.address}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium" htmlFor="compose-to">
              To
            </label>
            <button
              type="button"
              className="text-xs font-medium text-accent-fill hover:underline"
              onClick={() => setShowCcBcc((v) => !v)}
            >
              {showCcBcc ? "Hide Cc/Bcc" : "Cc/Bcc"}
            </button>
          </div>
          <input
            id="compose-to"
            className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        {showCcBcc ? (
          <>
            <label className="grid gap-1.5 text-sm font-medium">
              Cc
              <input
                className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Bcc
              <input
                className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
              />
            </label>
          </>
        ) : null}
        <label className="grid gap-1.5 text-sm font-medium">
          Subject
          <input
            className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </label>
        {subjectIdeas.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {subjectIdeas.map((idea) => (
              <li key={idea}>
                <button
                  type="button"
                  onClick={() => setSubject(idea)}
                  className="rounded-control border border-line px-2.5 py-1 text-xs hover:bg-canvas-sunken"
                >
                  {idea}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["text", "Plain text"],
              ["html", "HTML"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`h-8 rounded-control px-3 text-sm font-medium ${
                mode === id
                  ? "bg-accent-soft text-accent-fill"
                  : "border border-line text-ink-secondary hover:bg-canvas-sunken"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Message
          <textarea
            className="min-h-40 rounded-control border border-line-strong bg-canvas px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-accent"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            spellCheck={mode === "text"}
          />
        </label>
        <div className="grid gap-2">
          <label className="text-sm font-medium">
            Attachments
            <input
              type="file"
              multiple
              disabled={uploading}
              className="mt-1 block w-full text-sm text-ink-secondary file:mr-3 file:rounded-control file:border-0 file:bg-canvas-sunken file:px-3 file:py-1.5 file:text-sm file:font-medium"
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {uploading ? <p className="text-xs text-ink-muted">Uploading…</p> : null}
          {attachments.length > 0 ? (
            <ul className="grid gap-1">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-control border border-line px-3 py-1.5 text-sm"
                >
                  <span className="truncate">
                    {a.filename}{" "}
                    <span className="text-xs text-ink-faint">
                      ({Math.max(1, Math.round(a.size / 1024))} KB)
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={removeAtt.isPending}
                    onClick={() => removeAtt.mutate(a.id)}
                    className="text-xs font-medium text-danger-ink hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {aiComposeOk ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as typeof tone)}
              className="h-8 rounded-control border border-line bg-canvas px-2 text-xs"
            >
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="concise">Concise</option>
              <option value="empathetic">Empathetic</option>
            </select>
            {(
              [
                ["subjects", "Subjects"],
                ["rewrite", "Rewrite"],
                ["shorten", "Shorten"],
                ["grammar", "Grammar"],
              ] as const
            ).map(([action, label]) => (
              <button
                key={action}
                type="button"
                disabled={assist.isPending || (!body.trim() && action !== "subjects")}
                onClick={() => assist.mutate(action)}
                className="h-8 rounded-control border border-line px-2.5 text-xs font-medium hover:bg-canvas-sunken disabled:opacity-50"
              >
                {assist.isPending ? "…" : label}
              </button>
            ))}
            <span className="text-xs text-ink-faint">
              {ai.data!.credits.available} credits left
            </span>
          </div>
        ) : ai.data ? (
          <p className="text-xs text-ink-muted">AI compose unavailable on {ai.data.planLabel}.</p>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={schedule}
            onChange={(e) => setSchedule(e.target.checked)}
          />
          Schedule send
        </label>
        {schedule ? (
          <label className="grid gap-1.5 text-sm font-medium">
            Send at
            <input
              type="datetime-local"
              required={schedule}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-10 rounded-control border border-line-strong bg-canvas px-3"
            />
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={send.isPending || uploading}
            className="h-10 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-60"
          >
            {send.isPending ? "Sending…" : schedule ? "Schedule" : "Send"}
          </button>
          <Link
            to="/$orgSlug/inbox"
            params={{ orgSlug }}
            className="inline-flex h-10 items-center rounded-control border border-line px-4 text-sm font-medium text-ink-secondary hover:bg-canvas-sunken"
          >
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
