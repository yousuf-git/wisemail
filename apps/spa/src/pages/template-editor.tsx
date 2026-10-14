import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";

import { BreadcrumbLabel } from "@/components/app/breadcrumb-label";
import { PreviewFrame } from "@/components/composer/preview-frame";
import {
  ResourceError,
  ResourcePage,
  ResourcePending,
} from "@/components/resource-page";
import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
} from "@/lib/actions";
import {
  getTemplate,
  listTemplates,
  type TemplateDetail,
  type TemplateVariable,
} from "@/lib/api";
import { extractVariables, renderTemplate } from "@/lib/mail/template-vars";

const HtmlEditor = lazy(() => import("@/components/composer/html-editor"));

const STARTER_HTML = `<h1>Hello {{{NAME}}}</h1>
<p>Write your message here. Variables in triple braces are filled in when you send.</p>`;

type VariableRow = TemplateVariable & { sample: string };

function toRows(template: TemplateDetail | null): VariableRow[] {
  return (template?.variables ?? []).map((v) => ({
    ...v,
    fallback: v.fallback,
    sample: "",
  }));
}

function EditorForm({
  orgSlug,
  template,
  connections,
  canDelete,
}: {
  orgSlug: string;
  template: TemplateDetail | null;
  connections: { id: string; name: string; writable: boolean }[];
  canDelete: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = template === null;
  const writableConnections = connections.filter((c) => c.writable);

  const [connectionId, setConnectionId] = useState(
    template?.connectionId ?? writableConnections[0]?.id ?? "",
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
  const [error, setError] = useState<string | null>(null);

  const editable = isNew || !!template?.writable;

  const undeclared = useMemo(() => {
    const declared = new Set(rows.map((r) => r.key.trim().toLowerCase()));
    return extractVariables(html, subject, text).filter((k) => !declared.has(k.toLowerCase()));
  }, [html, subject, text, rows]);

  const defs = useMemo(
    () =>
      rows.map((r) => ({
        key: r.key.trim(),
        type: r.type,
        fallback: typeof r.fallback === "string" ? r.fallback.trim() || null : r.fallback,
      })),
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

  const invalidate = async (id?: string) => {
    await queryClient.invalidateQueries({ queryKey: ["templates", orgSlug] });
    if (id) await queryClient.invalidateQueries({ queryKey: ["template", orgSlug, id] });
  };

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const variables = rows.map((r) => ({
        key: r.key.trim(),
        type: r.type,
        fallback:
          r.fallback === "" || r.fallback == null
            ? null
            : r.type === "number"
              ? Number(r.fallback)
              : String(r.fallback),
      }));
      const body = {
        name,
        alias: alias.trim(),
        subject,
        from,
        html,
        text,
        variables,
      };
      if (isNew) return createTemplate(orgSlug, { connectionId, ...body });
      return updateTemplate(orgSlug, { id: template!.id, version, ...body, publish });
    },
    onSuccess: async (result, publish) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      const data = result.data as TemplateDetail;
      setVersion(data.version);
      setStatus(data.status);
      await invalidate(data.id);
      if (isNew) {
        if (publish) {
          await updateTemplate(orgSlug, {
            id: data.id,
            version: data.version,
            name: data.name,
            alias: data.alias,
            subject: data.subject,
            from: data.from,
            html: data.html,
            text: data.text,
            variables: data.variables,
            publish: true,
          });
        }
        await navigate({
          to: "/$orgSlug/templates/$templateId",
          params: { orgSlug, templateId: data.id },
        });
      }
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteTemplate(orgSlug, template!.id),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await invalidate();
      await navigate({ to: "/$orgSlug/templates", params: { orgSlug } });
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate(status === "published");
        }}
      >
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        <p className="text-xs font-medium text-ink-muted">
          Status: <span className="text-ink">{status}</span>
        </p>

        {isNew && writableConnections.length > 1 ? (
          <label className="grid gap-1 text-xs font-medium">
            Connection
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="h-9 rounded-control border border-line bg-canvas px-2 text-sm"
            >
              {writableConnections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium">
            Name
            <input
              required
              value={name}
              disabled={!editable}
              onChange={(e) => setName(e.target.value)}
              className="h-9 rounded-control border border-line bg-canvas px-3 text-sm disabled:opacity-60"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Alias
            <input
              value={alias}
              disabled={!editable}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="welcome-email"
              className="h-9 rounded-control border border-line bg-canvas px-3 text-sm disabled:opacity-60"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium">
            Subject
            <input
              value={subject}
              disabled={!editable}
              onChange={(e) => setSubject(e.target.value)}
              className="h-9 rounded-control border border-line bg-canvas px-3 text-sm disabled:opacity-60"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            From
            <input
              value={from}
              disabled={!editable}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Team <hello@example.com>"
              className="h-9 rounded-control border border-line bg-canvas px-3 text-sm disabled:opacity-60"
            />
          </label>
        </div>

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

        <label className="grid gap-1 text-xs font-medium">
          Plain text (optional)
          <textarea
            value={text}
            disabled={!editable}
            onChange={(e) => setText(e.target.value)}
            className="min-h-20 rounded-control border border-line bg-canvas px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>

        <fieldset className="grid gap-2 rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Variables
          </legend>
          {undeclared.length > 0 ? (
            <p className="text-xs text-warning-ink">
              Used but not declared: {undeclared.join(", ")}.{" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() =>
                  setRows((prev) => [
                    ...prev,
                    ...undeclared.map((key) => ({
                      key,
                      type: "string" as const,
                      fallback: null,
                      sample: "",
                    })),
                  ])
                }
              >
                Add them
              </button>
            </p>
          ) : null}
          {rows.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_1fr_auto]">
              <input
                value={row.key}
                disabled={!editable}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)),
                  )
                }
                placeholder="NAME"
                className="h-8 rounded-control border border-line bg-canvas px-2 text-xs"
              />
              <select
                value={row.type}
                disabled={!editable}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) =>
                      i === index
                        ? { ...r, type: e.target.value as "string" | "number" }
                        : r,
                    ),
                  )
                }
                className="h-8 rounded-control border border-line bg-canvas px-1 text-xs"
              >
                <option value="string">string</option>
                <option value="number">number</option>
              </select>
              <input
                value={row.fallback == null ? "" : String(row.fallback)}
                disabled={!editable}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) =>
                      i === index ? { ...r, fallback: e.target.value || null } : r,
                    ),
                  )
                }
                placeholder="Fallback"
                className="h-8 rounded-control border border-line bg-canvas px-2 text-xs"
              />
              <input
                value={row.sample}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) => (i === index ? { ...r, sample: e.target.value } : r)),
                  )
                }
                placeholder="Sample"
                className="h-8 rounded-control border border-line bg-canvas px-2 text-xs"
              />
              {editable ? (
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  className="text-xs text-danger-ink"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          {editable ? (
            <button
              type="button"
              onClick={() =>
                setRows((prev) => [
                  ...prev,
                  { key: "", type: "string", fallback: null, sample: "" },
                ])
              }
              className="justify-self-start text-xs font-medium text-accent-fill hover:underline"
            >
              Add variable
            </button>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap gap-2">
          {editable ? (
            <>
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => {
                  setError(null);
                  save.mutate(false);
                }}
                className="h-9 rounded-control border border-line px-4 text-sm font-medium disabled:opacity-50"
              >
                {save.isPending ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => {
                  setError(null);
                  save.mutate(true);
                }}
                className="h-9 rounded-control bg-accent-fill px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                {save.isPending ? "Saving…" : "Publish"}
              </button>
            </>
          ) : null}
          {!isNew && canDelete && editable ? (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm("Delete this template?")) remove.mutate();
              }}
              className="h-9 rounded-control border border-line px-3 text-sm font-medium text-danger-ink hover:bg-danger-soft"
            >
              Delete
            </button>
          ) : null}
        </div>
      </form>

      <aside className="rounded-lg border border-line bg-surface p-2 self-start">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Preview
        </p>
        <PreviewFrame html={preview} title="Template preview" className="min-h-[360px]" />
      </aside>
    </div>
  );
}

export function TemplateNewPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const list = useQuery({
    queryKey: ["templates", orgSlug],
    queryFn: () => listTemplates(orgSlug),
  });

  return (
    <ResourcePage
      title="New template"
      description="Write the HTML, declare the variables, preview it, then publish."
    >
      <Link
        to="/$orgSlug/templates"
        params={{ orgSlug }}
        className="text-sm font-medium text-accent-fill hover:underline"
      >
        ← Templates
      </Link>
      {list.isPending ? (
        <ResourcePending />
      ) : list.isError ? (
        <ResourceError message="Could not load connections." />
      ) : (
        <EditorForm
          orgSlug={orgSlug}
          template={null}
          connections={list.data.connections}
          canDelete={false}
        />
      )}
    </ResourcePage>
  );
}

export function TemplateDetailPage() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const { templateId } = useParams({ strict: false }) as { templateId: string };

  const list = useQuery({
    queryKey: ["templates", orgSlug],
    queryFn: () => listTemplates(orgSlug),
  });
  const template = useQuery({
    queryKey: ["template", orgSlug, templateId],
    queryFn: () => getTemplate(orgSlug, templateId),
  });

  return (
    <ResourcePage
      title={template.data?.name || "Template"}
      description={template.data?.subject || "`GET /api/v1/templates/:id`"}
    >
      {template.data ? (
        <BreadcrumbLabel segment={templateId} label={template.data.name} />
      ) : null}
      <Link
        to="/$orgSlug/templates"
        params={{ orgSlug }}
        className="text-sm font-medium text-accent-fill hover:underline"
      >
        ← Templates
      </Link>
      {template.isPending || list.isPending ? (
        <ResourcePending />
      ) : template.isError || list.isError || !template.data || !list.data ? (
        <ResourceError message="Could not load this template." />
      ) : (
        <EditorForm
          orgSlug={orgSlug}
          template={template.data}
          connections={list.data.connections}
          canDelete={list.data.can.delete}
        />
      )}
    </ResourcePage>
  );
}
