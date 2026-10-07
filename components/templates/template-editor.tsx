"use client";

import { Copy, Eye, Loader2, Monitor, Moon, Smartphone, Sun, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  createTemplateAction,
  deleteTemplateAction,
  duplicateTemplateAction,
  updateTemplateAction,
} from "@/app/(app)/[orgSlug]/templates/actions";
import { ConfirmDeleteDialog } from "@/components/audience/confirm-delete-dialog";
import { ConnectionSelect, firstWritable } from "@/components/audience/connection-select";
import { audienceError, fieldErrorMap } from "@/components/audience/errors";
import { StatusChip } from "@/components/app/status-chip";
import { PreviewFrame } from "@/components/composer/preview-frame";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ConnectionOptionDTO, TemplateDTO } from "@/lib/dto/audience";
import { extractVariables, renderTemplate } from "@/lib/mail/template-vars";
import { cn } from "@/lib/utils";
import { VariablesEditor, variableErrors, type VariableRow } from "./variables-editor";

const HtmlEditor = lazy(() => import("@/components/composer/html-editor"));

const STARTER_HTML = `<h1>Hello {{{NAME}}}</h1>
<p>Write your message here. Variables in triple braces are filled in when you send.</p>`;

const toRows = (template: TemplateDTO | null): VariableRow[] =>
  (template?.variables ?? []).map((v) => ({
    key: v.key,
    type: v.type,
    fallback: v.fallback === null ? "" : String(v.fallback),
    sample: "",
  }));

/**
 * Template editor (PRD §5.9): HTML in the composer's CodeMirror editor, a sandboxed preview with
 * sample values, the variables the template declares, and draft / publish. Only published
 * templates can be sent; saving a published template publishes it again.
 */
export function TemplateEditor({
  orgSlug,
  template,
  connections,
  canEdit,
  canCreate,
  canDelete,
}: {
  orgSlug: string;
  /** `null` for a new template. */
  template: TemplateDTO | null;
  connections: ConnectionOptionDTO[];
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const isNew = template === null;
  const [connectionId, setConnectionId] = useState(
    template?.connectionId ?? firstWritable(connections),
  );
  const [name, setName] = useState(template?.name ?? "");
  const [alias, setAlias] = useState(template?.alias ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [from, setFrom] = useState(template?.from ?? "");
  const [html, setHtml] = useState(template?.html ?? STARTER_HTML);
  const [text, setText] = useState(template?.text ?? "");
  const [rows, setRows] = useState<VariableRow[]>(() => toRows(template));
  const [version, setVersion] = useState(template?.version ?? 0);
  const [status, setStatus] = useState(template?.status ?? "draft");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "draft" | "publish">(null);
  const [deleting, setDeleting] = useState(false);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [dark, setDark] = useState(false);

  const editable = canEdit && (isNew || (template?.writable ?? false));
  const undeclared = useMemo(() => {
    const declared = new Set(rows.map((r) => r.key.trim().toLowerCase()));
    return extractVariables(html, subject, text).filter((k) => !declared.has(k.toLowerCase()));
  }, [html, subject, text, rows]);

  const defs = useMemo(
    () =>
      rows.map((r) => ({ key: r.key.trim(), type: r.type, fallback: r.fallback.trim() || null })),
    [rows],
  );
  const sample = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.key.trim(), r.sample])),
    [rows],
  );
  const preview = useMemo(
    () => renderTemplate(html, sample, defs, { escape: true }),
    [html, sample, defs],
  );
  const previewSubject = useMemo(
    () => renderTemplate(subject, sample, defs),
    [subject, sample, defs],
  );

  async function save(publish: boolean) {
    setBanner(null);
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = "Give the template a name.";
    if (!html.trim()) local.html = "Add some HTML.";
    if (isNew && !connectionId) local.connectionId = "Choose an account.";
    if (Object.keys(variableErrors(rows)).length)
      local.variables = "Fix the variables marked below.";
    setErrors(local);
    if (Object.keys(local).length) return setBanner("Fix the highlighted fields, then save again.");

    const variables = rows.map((r) => ({
      key: r.key.trim(),
      type: r.type,
      fallback:
        r.fallback.trim() === ""
          ? null
          : r.type === "number"
            ? Number(r.fallback)
            : r.fallback.trim(),
    }));
    const body = { name, alias: alias.trim(), subject, from, html, text, variables };
    setBusy(publish ? "publish" : "draft");
    const result = template
      ? await updateTemplateAction(orgSlug, { id: template.id, version, ...body, publish })
      : await createTemplateAction(orgSlug, { connectionId, ...body });
    setBusy(null);
    if (!result.ok) {
      setErrors(fieldErrorMap(result.error.fieldErrors));
      setBanner(audienceError(result.error));
      if (result.error.code === "conflict") {
        toast.error("This template was edited somewhere else", {
          description: "Reload to get the latest version.",
          action: { label: "Reload", onClick: () => router.refresh() },
        });
      }
      return;
    }
    if (!template) {
      // A new template: publish it right away when asked, then open it.
      if (publish) {
        const published = await updateTemplateAction(orgSlug, {
          id: result.data.id,
          version: result.data.version,
          ...body,
          publish: true,
        });
        if (!published.ok) toast.error(`Created as a draft. ${audienceError(published.error)}`);
      }
      toast.success(publish ? "Template published" : "Template saved as a draft");
      router.replace(`/${orgSlug}/templates/${result.data.id}`);
      return;
    }
    setVersion(result.data.version);
    setStatus(result.data.status);
    setRows((current) =>
      result.data.variables.map((v) => ({
        key: v.key,
        type: v.type,
        fallback: v.fallback === null ? "" : String(v.fallback),
        sample: current.find((r) => r.key === v.key)?.sample ?? "",
      })),
    );
    toast.success(publish || status === "published" ? "Saved and published" : "Draft saved");
    router.refresh();
  }

  async function duplicate(targetConnectionId?: string) {
    if (!template) return;
    const result = await duplicateTemplateAction(orgSlug, {
      id: template.id,
      connectionId: targetConnectionId,
    });
    if (!result.ok) return void toast.error(audienceError(result.error));
    toast.success("Copied as a draft");
    router.push(`/${orgSlug}/templates/${result.data.id}`);
  }

  const busyIcon = <Loader2 aria-hidden className="animate-spin" />;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {template ? (
          <StatusChip state={status === "published" ? "success" : "neutral"}>
            {status === "published" ? "Published" : "Draft"}
          </StatusChip>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {template && canCreate ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  <Copy aria-hidden /> Duplicate
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Copy as a draft to</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {connections.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    disabled={!c.writable}
                    onSelect={() => void duplicate(c.id)}
                  >
                    {c.name}
                    {c.id === template.connectionId ? " (same account)" : ""}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {template && canDelete && (template.writable ?? false) ? (
            <Button
              type="button"
              variant="ghost"
              className="text-danger-ink"
              onClick={() => setDeleting(true)}
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          ) : null}
          {editable && status !== "published" ? (
            <Button
              type="button"
              variant="outline"
              disabled={!!busy}
              onClick={() => void save(false)}
            >
              {busy === "draft" ? busyIcon : null}
              Save draft
            </Button>
          ) : null}
          {editable ? (
            <Button
              type="button"
              className="font-semibold"
              disabled={!!busy}
              onClick={() => void save(true)}
            >
              {busy === "publish" ? busyIcon : null}
              {status === "published" ? "Save and publish" : "Publish"}
            </Button>
          ) : null}
        </div>
      </div>

      {!editable ? (
        <p
          role="status"
          className="rounded-control-block bg-canvas-sunken px-4 py-3 text-sm text-ink-secondary"
        >
          {canEdit
            ? "This account isn't accepting changes right now, so the template is view-only."
            : "Your role can view templates but not change them."}
        </p>
      ) : null}
      {banner ? (
        <p
          role="alert"
          data-testid="template-error"
          className="rounded-control-block bg-danger-soft px-3 py-2 text-sm text-danger-ink"
        >
          {banner}
        </p>
      ) : null}

      <div className="grid min-h-0 gap-3 min-[1100px]:h-[var(--shell-panel-height)] min-[1100px]:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-[var(--shell-panel-radius)] border border-line bg-surface p-4">
          {isNew && connections.length > 1 ? (
            <ConnectionSelect
              id="template-connection"
              connections={connections}
              value={connectionId}
              onChange={setConnectionId}
            />
          ) : null}
          <div className="grid gap-3 min-[560px]:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={name}
                maxLength={100}
                disabled={!editable}
                aria-invalid={!!errors.name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Welcome email"
              />
              {errors.name ? (
                <p role="alert" className="text-xs text-danger-ink">
                  {errors.name}
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="template-alias">
                Alias <span className="font-normal text-ink-muted">(optional)</span>
              </Label>
              <Input
                id="template-alias"
                value={alias}
                maxLength={60}
                disabled={!editable}
                aria-invalid={!!errors.alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="welcome"
                className="font-mono"
              />
              {errors.alias ? (
                <p role="alert" className="text-xs text-danger-ink">
                  {errors.alias}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="template-subject">Subject</Label>
            <Input
              id="template-subject"
              value={subject}
              maxLength={998}
              disabled={!editable}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Welcome, {{{NAME}}}"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="template-from">
              From <span className="font-normal text-ink-muted">(optional)</span>
            </Label>
            <Input
              id="template-from"
              value={from}
              maxLength={320}
              disabled={!editable}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Acme <hello@acme.com>"
            />
          </div>
          <div className="grid min-h-0 flex-1 gap-1.5">
            <span className="text-sm leading-none font-medium">HTML</span>
            <Suspense
              fallback={<Skeleton className="min-h-56 w-full rounded-control-block" />}
            >
              <HtmlEditor
                value={html}
                onChange={setHtml}
                disabled={!editable}
                className={cn(
                  "min-h-56 flex-1 rounded-control-block bg-canvas-sunken min-[1100px]:min-h-0",
                  errors.html && "ring-2 ring-danger",
                )}
              />
            </Suspense>
            {errors.html ? (
              <p role="alert" className="text-xs text-danger-ink">
                {errors.html}
              </p>
            ) : null}
          </div>
          <details className="grid gap-1.5">
            <summary className="cursor-pointer text-sm font-medium">
              Plain text version (optional)
            </summary>
            <Textarea
              rows={4}
              value={text}
              disabled={!editable}
              onChange={(e) => setText(e.target.value)}
              className="mt-2 font-mono text-[13px]"
            />
          </details>
          <section aria-label="Variables" className="grid gap-2 border-t border-line pt-3">
            <h2 className="text-sm font-semibold tracking-[-0.01em]">Variables</h2>
            <p className="text-xs text-ink-muted">
              A variable without a default must be filled in when sending. Preview values are only
              for this page.
            </p>
            <VariablesEditor
              rows={rows}
              onChange={setRows}
              undeclared={undeclared}
              disabled={!editable}
            />
            {errors.variables ? (
              <p role="alert" className="text-xs text-danger-ink">
                {errors.variables}
              </p>
            ) : null}
          </section>
        </div>

        <section
          aria-label="Preview"
          className="flex min-h-[28rem] flex-col gap-2 rounded-[var(--shell-panel-radius)] border border-line bg-surface p-3 min-[1100px]:min-h-0"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-[-0.01em]">
              <Eye aria-hidden className="size-4 text-ink-muted" /> Preview
            </h2>
            <div className="flex items-center gap-1" role="group" aria-label="Preview options">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Desktop width"
                aria-pressed={width === "desktop"}
                onClick={() => setWidth("desktop")}
                className={cn(width === "desktop" && "bg-accent-soft")}
              >
                <Monitor aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Mobile width"
                aria-pressed={width === "mobile"}
                onClick={() => setWidth("mobile")}
                className={cn(width === "mobile" && "bg-accent-soft")}
              >
                <Smartphone aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={dark ? "Light preview" : "Dark preview"}
                aria-pressed={dark}
                onClick={() => setDark((d) => !d)}
              >
                {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
              </Button>
            </div>
          </div>
          {previewSubject ? (
            <p className="truncate text-sm">
              <span className="text-ink-muted">Subject: </span>
              <span className="font-semibold">{previewSubject}</span>
            </p>
          ) : null}
          <PreviewFrame
            html={preview}
            dark={dark}
            width={width}
            title="Template preview"
            className="min-h-0 flex-1"
          />
        </section>
      </div>

      {template ? (
        <ConfirmDeleteDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete ${template.name}?`}
          confirmLabel="Delete template"
          onConfirm={async () => {
            const result = await deleteTemplateAction(orgSlug, { id: template.id });
            if (!result.ok) return audienceError(result.error);
            toast.success("Template deleted");
            router.push(`/${orgSlug}/templates`);
            return null;
          }}
        >
          <p>
            This also deletes the template in Resend ({template.connectionName}). It can&apos;t be
            undone.
          </p>
          <p>Emails already sent with it stay in your activity log.</p>
        </ConfirmDeleteDialog>
      ) : null}
    </div>
  );
}
