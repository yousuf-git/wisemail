import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Eye, EyeOff, Monitor, Moon, Smartphone, Sun } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";

import { AddressField } from "@/components/composer/address-field";
import { isBodyBlank, isLossyForRich } from "@/components/composer/compose-validation";
import { PreviewFrame } from "@/components/composer/preview-frame";
import { SchedulePicker } from "@/components/composer/schedule-picker";
import { isValidTimeZone } from "@/components/composer/schedule";
import { TemplatePanel } from "@/components/composer/template-panel";
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
  getGeneralSettings,
  listSenders,
  listTemplateOptions,
  sameOriginUploadUrl,
  type TemplateOption,
} from "@/lib/api";
import { missingVariables, renderTemplate } from "@/lib/mail/template-vars";
import { cn } from "@/lib/utils";

const RichEditor = lazy(() => import("@/components/composer/rich-editor"));
const HtmlEditor = lazy(() => import("@/components/composer/html-editor"));

function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

type Attached = { id: string; filename: string; size: number };
type EditorMode = "rich" | "html" | "template";

export function ComposePage() {
  const { orgSlug } = useParams({ from: "/$orgSlug/compose" });
  const navigate = useNavigate();
  const senders = useQuery({
    queryKey: ["senders", orgSlug],
    queryFn: () => listSenders(orgSlug),
  });
  const settings = useQuery({
    queryKey: ["settings-general", orgSlug],
    queryFn: () => getGeneralSettings(orgSlug),
  });
  const templatesQ = useQuery({
    queryKey: ["template-options", orgSlug],
    queryFn: () => listTemplateOptions(orgSlug),
    retry: false,
  });
  const ai = useQuery({
    queryKey: ["ai-status", orgSlug],
    queryFn: () => getAiStatus(orgSlug),
  });

  const activeSenders = useMemo(
    () => (senders.data?.senders ?? []).filter((s) => s.status === "active"),
    [senders.data],
  );
  const defaultSenderId =
    activeSenders.find((s) => s.isDefault)?.id ?? activeSenders[0]?.id ?? "";

  const timeZone = isValidTimeZone(settings.data?.timezone)
    ? settings.data!.timezone
    : (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");

  const [senderId, setSenderId] = useState(defaultSenderId);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [mode, setMode] = useState<EditorMode>("rich");
  const [bodyHtml, setBodyHtml] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewDark, setPreviewDark] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectIdeas, setSubjectIdeas] = useState<string[]>([]);
  const [tone, setTone] = useState<"friendly" | "professional" | "concise" | "empathetic">(
    "friendly",
  );
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | undefined>(undefined);
  const [attachments, setAttachments] = useState<Attached[]>([]);
  const [uploading, setUploading] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [templateErrors, setTemplateErrors] = useState<Record<string, string>>({});

  const effectiveSenderId = senderId || defaultSenderId;
  const sender = activeSenders.find((s) => s.id === effectiveSenderId);
  const senderConnection = sender?.connectionId;
  const availableTemplates = useMemo(
    () =>
      (templatesQ.data ?? []).filter(
        (t) => !senderConnection || t.connectionId === senderConnection,
      ),
    [templatesQ.data, senderConnection],
  );
  const template: TemplateOption | null =
    availableTemplates.find((t) => t.id === templateId) ?? null;

  const renderedTemplate = template
    ? renderTemplate(template.html, templateValues, template.variables, { escape: true })
    : "";
  const renderedSubject = template
    ? renderTemplate(template.subject, templateValues, template.variables)
    : subject;

  const previewVisible = mode === "html" || mode === "template" || showPreview;
  const previewHtml =
    mode === "template"
      ? renderedTemplate
      : isBodyBlank(bodyHtml)
        ? ""
        : bodyHtml;

  const aiComposeOk =
    ai.data?.planIncluded &&
    ai.data.enabled &&
    ai.data.canUse &&
    ai.data.features.compose &&
    (ai.data.credits.available ?? 0) > 0;

  function changeMode(next: EditorMode) {
    if (next === mode) return;
    if (next === "template") {
      if (availableTemplates.length === 0) return;
      setMode("template");
      return;
    }
    if (
      next === "rich" &&
      isLossyForRich(bodyHtml) &&
      !window.confirm(
        "Rich text keeps simple formatting only. Tables, custom styles and other HTML will be simplified. Switch anyway?",
      )
    ) {
      return;
    }
    setMode(next);
    setEditorKey((k) => k + 1);
  }

  function chooseTemplate(id: string) {
    const chosen = availableTemplates.find((t) => t.id === id);
    setTemplateId(id);
    setTemplateValues({});
    setTemplateErrors({});
    if (chosen && !subject.trim()) setSubject(chosen.subject);
  }

  async function ensureDraft(): Promise<{ id: string; version: number }> {
    if (draftId && draftVersion !== undefined) return { id: draftId, version: draftVersion };
    const result = await saveDraft(orgSlug, {
      senderId: effectiveSenderId || null,
      to,
      subject,
      bodyHtml: bodyHtml || "<p></p>",
      mode: mode === "template" ? "template" : mode,
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
      if (!to.length) throw new Error("Add at least one recipient.");
      if (!subject.trim() && mode !== "template") throw new Error("Add a subject.");
      if (mode === "template") {
        if (!template) throw new Error("Choose a template.");
        const missing = missingVariables(template.variables, templateValues);
        if (missing.length) {
          setTemplateErrors(Object.fromEntries(missing.map((k) => [k, "Required."])));
          throw new Error("Fill the required template fields.");
        }
        return sendEmail(orgSlug, {
          senderId: effectiveSenderId,
          to,
          cc,
          bcc,
          subject: subject.trim() || template.subject,
          templateId: template.id,
          templateVariables: Object.fromEntries(
            Object.entries(templateValues)
              .filter(([, v]) => v.trim() !== "")
              .map(([k, v]) => [k, v.trim()]),
          ),
          scheduledAt: scheduledAt?.toISOString(),
          attachmentIds: attachments.map((a) => a.id),
          draftId: draftId ?? undefined,
        });
      }
      if (isBodyBlank(bodyHtml)) throw new Error("Write a message.");
      return sendEmail(orgSlug, {
        senderId: effectiveSenderId,
        to,
        cc,
        bcc,
        subject,
        html: bodyHtml,
        text: mode === "rich" ? htmlToPlain(bodyHtml) : undefined,
        scheduledAt: scheduledAt?.toISOString(),
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
        to: scheduledAt ? "/$orgSlug/scheduled" : "/$orgSlug/inbox",
        params: { orgSlug },
      });
    },
    onError: (e: Error) => setError(e.message || "Could not send."),
  });

  const assist = useMutation({
    mutationFn: (action: "subjects" | "rewrite" | "shorten" | "grammar") =>
      aiComposeAssist(orgSlug, {
        action,
        subject,
        bodyHtml: bodyHtml || "<p></p>",
        tone: action === "rewrite" ? tone : undefined,
      }),
    onSuccess: (result) => {
      setError(null);
      if (result.kind === "subjects") {
        setSubjectIdeas(result.suggestions);
        return;
      }
      setBodyHtml(result.html);
      setEditorKey((k) => k + 1);
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
        <p
          data-tour="compose-sender"
          className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-sm text-ink-muted"
        >
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
    <section className="grid max-w-4xl gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Compose</h1>
        <p className="text-sm text-ink-muted">
          Rich text · HTML · templates · preview · schedule · attachments · AI
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
        <label className="grid gap-1.5 text-sm font-medium" data-tour="compose-sender">
          From
          <select
            className="h-10 rounded-control border border-line-strong bg-canvas px-3"
            value={effectiveSenderId}
            onChange={(e) => {
              setSenderId(e.target.value);
              if (mode === "template") {
                setTemplateId(null);
                setTemplateValues({});
              }
            }}
          >
            {activeSenders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName ? `${s.displayName} <${s.address}>` : s.address}
              </option>
            ))}
          </select>
        </label>

        <AddressField
          label="To"
          values={to}
          onChange={setTo}
          placeholder="you@example.com"
          trailing={
            <button
              type="button"
              className="text-xs font-medium text-accent-fill hover:underline"
              onClick={() => setShowCcBcc((v) => !v)}
            >
              {showCcBcc ? "Hide Cc/Bcc" : "Cc/Bcc"}
            </button>
          }
        />
        {showCcBcc ? (
          <>
            <AddressField label="Cc" values={cc} onChange={setCc} />
            <AddressField label="Bcc" values={bcc} onChange={setBcc} />
          </>
        ) : null}

        <label className="grid gap-1.5 text-sm font-medium">
          Subject
          <input
            className="h-10 rounded-control border border-line-strong bg-canvas px-3 outline-none focus:ring-2 focus:ring-accent"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required={mode !== "template"}
          />
        </label>
        {mode === "template" && template && renderedSubject !== subject ? (
          <p className="text-xs text-ink-muted">Goes out as: {renderedSubject}</p>
        ) : null}
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

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex flex-wrap gap-1 rounded-control border border-line p-0.5"
            role="group"
            aria-label="Editor mode"
          >
            {(
              [
                ["rich", "Rich text"],
                ["html", "HTML"],
                ["template", "Template"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={id === "template" && availableTemplates.length === 0}
                title={
                  id === "template" && availableTemplates.length === 0
                    ? "No published templates for this sender's Resend account yet"
                    : undefined
                }
                onClick={() => changeMode(id)}
                className={cn(
                  "h-8 rounded-[calc(var(--radius-control)-2px)] px-3 text-sm font-medium disabled:opacity-40",
                  mode === id
                    ? "bg-accent-soft text-accent-fill"
                    : "text-ink-secondary hover:bg-canvas-sunken",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {previewVisible ? (
              <div className="flex items-center gap-0.5" role="group" aria-label="Preview options">
                <button
                  type="button"
                  aria-label="Desktop width"
                  aria-pressed={previewWidth === "desktop"}
                  onClick={() => setPreviewWidth("desktop")}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-control hover:bg-canvas-sunken",
                    previewWidth === "desktop" && "bg-accent-soft",
                  )}
                >
                  <Monitor className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Mobile width"
                  aria-pressed={previewWidth === "mobile"}
                  onClick={() => setPreviewWidth("mobile")}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-control hover:bg-canvas-sunken",
                    previewWidth === "mobile" && "bg-accent-soft",
                  )}
                >
                  <Smartphone className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={previewDark ? "Light preview" : "Dark preview"}
                  aria-pressed={previewDark}
                  onClick={() => setPreviewDark((d) => !d)}
                  className="inline-flex size-8 items-center justify-center rounded-control hover:bg-canvas-sunken"
                >
                  {previewDark ? (
                    <Sun className="size-4" aria-hidden />
                  ) : (
                    <Moon className="size-4" aria-hidden />
                  )}
                </button>
              </div>
            ) : null}
            {mode === "rich" ? (
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                aria-pressed={showPreview}
                className="inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-ink-secondary hover:bg-canvas-sunken"
              >
                {showPreview ? (
                  <EyeOff className="size-3.5" aria-hidden />
                ) : (
                  <Eye className="size-3.5" aria-hidden />
                )}
                {showPreview ? "Hide preview" : "Preview"}
              </button>
            ) : null}
          </div>
        </div>

        <div
          className={cn("grid min-h-56 gap-4", previewVisible && "min-[900px]:grid-cols-2")}
        >
          <div className="min-w-0">
            {mode === "template" ? (
              <TemplatePanel
                templates={availableTemplates}
                templateId={template?.id ?? null}
                onTemplate={chooseTemplate}
                values={templateValues}
                onValues={(values) => {
                  setTemplateValues(values);
                  setTemplateErrors({});
                }}
                errors={templateErrors}
              />
            ) : (
              <Suspense
                fallback={
                  <div
                    className="min-h-40 animate-pulse rounded-control bg-canvas-sunken"
                    aria-busy
                  />
                }
              >
                {mode === "rich" ? (
                  <RichEditor
                    key={`rich-${editorKey}`}
                    initialHtml={bodyHtml}
                    onChange={setBodyHtml}
                  />
                ) : (
                  <HtmlEditor
                    key={`html-${editorKey}`}
                    value={bodyHtml}
                    onChange={setBodyHtml}
                    className="max-h-[32rem] rounded-control border border-line bg-canvas-sunken px-1"
                  />
                )}
              </Suspense>
            )}
          </div>
          {previewVisible ? (
            <PreviewFrame
              html={previewHtml}
              dark={previewDark}
              width={previewWidth}
              className="max-h-[32rem] min-h-64"
            />
          ) : null}
        </div>

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
        {mode !== "template" && aiComposeOk ? (
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
                disabled={assist.isPending || (isBodyBlank(bodyHtml) && action !== "subjects")}
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
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <SchedulePicker
            value={scheduledAt}
            onChange={setScheduledAt}
            timeZone={timeZone}
            disabled={send.isPending}
          />
          <button
            type="submit"
            disabled={send.isPending || uploading}
            className="h-10 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink hover:bg-accent-fill-hover disabled:opacity-60"
          >
            {send.isPending ? "Sending…" : scheduledAt ? "Schedule" : "Send"}
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
