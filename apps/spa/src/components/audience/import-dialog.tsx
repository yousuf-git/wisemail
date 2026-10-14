import { Download, FileUp, Loader2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  appendImportRows,
  createContactImport,
  getContactImport,
  importContactsBatch,
  importFinished,
  startContactImport,
} from "@/lib/actions";
import type { AudienceOptions } from "@/lib/api";
import {
  buildImportRows,
  errorsToCsv,
  guessMapping,
  parseCsv,
  type ColumnTarget,
  type ImportRowError,
  type ParsedCsv,
} from "@/lib/audience/csv";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMPORT_BATCH_SIZE = 25;
const IMPORT_INLINE_LIMIT = 500;
const IMPORT_MAX_ROWS = 20_000;
const UPLOAD_CHUNK = 500;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Stage = "pick" | "map" | "run" | "done";
type Totals = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  processed: number;
};
const ZERO: Totals = { created: 0, updated: 0, skipped: 0, failed: 0, processed: 0 };

function firstWritable(connections: AudienceOptions["connections"]) {
  return connections.find((c) => c.writable)?.id ?? connections[0]?.id ?? "";
}

/**
 * CSV import (PRD §5.9). Parsed and validated in the browser; small files run inline,
 * large ones upload once and a background job finishes them.
 */
export function ImportDialog({
  orgSlug,
  options,
  open,
  onOpenChange,
  onDone,
}: {
  orgSlug: string;
  options: AudienceOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [stage, setStage] = useState<Stage>("pick");
  const [connectionId, setConnectionId] = useState(firstWritable(options.connections));
  const [segmentIds, setSegmentIds] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<ColumnTarget[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const [totals, setTotals] = useState<Totals>(ZERO);
  const [total, setTotal] = useState(0);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [background, setBackground] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      cancelled.current = false;
      setStage("pick");
      setConnectionId(firstWritable(options.connections));
      setSegmentIds([]);
      setUpdateExisting(false);
      setCsv(null);
      setFileName("");
      setMapping([]);
      setPickError(null);
      setTotals(ZERO);
      setTotal(0);
      setErrors([]);
      setRunError(null);
      setBackground(false);
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open, options.connections]);

  const segments = options.segments.filter((s) => s.connectionId === connectionId);
  const properties = useMemo(
    () => options.properties.filter((p) => p.connectionId === connectionId),
    [options.properties, connectionId],
  );

  const built = useMemo(
    () => (csv ? buildImportRows(csv.rows, mapping, properties) : null),
    [csv, mapping, properties],
  );
  const mappedEmail = mapping.includes("email");

  async function onFile(file: File | undefined) {
    setPickError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setPickError("That file is over 5 MB. Split it and import the parts.");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setPickError("We couldn't find any rows. The first line should be the column names.");
      return;
    }
    if (parsed.rows.length > IMPORT_MAX_ROWS) {
      setPickError(
        `That file has ${parsed.rows.length.toLocaleString()} rows. The limit is ${IMPORT_MAX_ROWS.toLocaleString()} per import.`,
      );
      return;
    }
    setFileName(file.name);
    setCsv(parsed);
    setMapping(guessMapping(parsed.headers, properties.map((p) => p.key)));
    setStage("map");
  }

  const bump = (patch: Partial<Totals>) =>
    setTotals((t) => ({
      created: t.created + (patch.created ?? 0),
      updated: t.updated + (patch.updated ?? 0),
      skipped: t.skipped + (patch.skipped ?? 0),
      failed: t.failed + (patch.failed ?? 0),
      processed: t.processed + (patch.processed ?? 0),
    }));

  const runInline = useCallback(
    async (rows: NonNullable<typeof built>["valid"], failedBefore: number) => {
      let cursor = 0;
      const sum = { created: 0, updated: 0, skipped: 0, failed: failedBefore };
      while (cursor < rows.length && !cancelled.current) {
        const batch = rows.slice(cursor, cursor + IMPORT_BATCH_SIZE);
        const result = await importContactsBatch(orgSlug, {
          connectionId,
          rows: batch,
          segmentIds,
          updateExisting,
        });
        if (!result.ok) {
          setRunError(result.error.message);
          break;
        }
        const r = result.data;
        cursor += r.processed;
        sum.created += r.created;
        sum.updated += r.updated;
        sum.skipped += r.skipped;
        sum.failed += r.errors.length;
        bump({
          created: r.created,
          updated: r.updated,
          skipped: r.skipped,
          failed: r.errors.length,
          processed: r.processed,
        });
        if (r.errors.length) setErrors((e) => [...e, ...r.errors]);
        if (r.rateLimited) await sleep(4000);
      }
      await importFinished(orgSlug, { connectionId, ...sum });
    },
    [orgSlug, connectionId, segmentIds, updateExisting],
  );

  const runJob = useCallback(
    async (rows: NonNullable<typeof built>["valid"], clientErrors: ImportRowError[]) => {
      setBackground(true);
      const created = await createContactImport(orgSlug, {
        connectionId,
        segmentIds,
        updateExisting,
        total: rows.length,
      });
      if (!created.ok) {
        setRunError(created.error.message);
        return;
      }
      const { importId } = created.data;
      for (let i = 0; i < rows.length; i += UPLOAD_CHUNK) {
        const sent = await appendImportRows(orgSlug, {
          importId,
          rows: rows.slice(i, i + UPLOAD_CHUNK),
        });
        if (!sent.ok) {
          setRunError(sent.error.message);
          return;
        }
      }
      const started = await startContactImport(orgSlug, importId);
      if (!started.ok) {
        setRunError(started.error.message);
        return;
      }
      for (;;) {
        await sleep(2000);
        const status = await getContactImport(orgSlug, importId);
        if (!status.ok) {
          setRunError(status.error.message);
          return;
        }
        const s = status.data;
        setTotals({
          created: s.created,
          updated: s.updated,
          skipped: s.skipped,
          failed: s.errorCount + clientErrors.length,
          processed: s.processed + clientErrors.length,
        });
        setErrors([...clientErrors, ...s.errors]);
        if (s.status === "completed") return;
        if (s.status === "failed") {
          setRunError(
            "The import stopped: the account needs attention. What was imported so far is kept.",
          );
          return;
        }
      }
    },
    [orgSlug, connectionId, segmentIds, updateExisting],
  );

  async function start() {
    if (!built || built.valid.length === 0) return;
    cancelled.current = false;
    setRunError(null);
    setTotals({ ...ZERO, failed: built.errors.length });
    setErrors(built.errors);
    setTotal(built.valid.length + built.errors.length);
    setStage("run");
    setTotals((t) => ({ ...t, processed: built.errors.length }));
    if (built.valid.length > IMPORT_INLINE_LIMIT) await runJob(built.valid, built.errors);
    else await runInline(built.valid, built.errors.length);
    setStage("done");
    onDone?.();
  }

  const running = stage === "run";
  const percent = total ? Math.min(100, Math.round((totals.processed / total) * 100)) : 0;

  const downloadErrors = () => {
    const url = URL.createObjectURL(new Blob([errorsToCsv(errors)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-problems.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const close = () => {
    if (running && !background) cancelled.current = true;
    onOpenChange(false);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto max-h-[90dvh] w-[min(100%,40rem)] overflow-y-auto rounded-xl border border-line bg-surface p-0 shadow-lg backdrop:bg-ink/40"
      onClose={close}
    >
      <div className="grid gap-4 p-5">
        <div className="grid gap-1">
          <h2 id={titleId} className="text-xl font-semibold">
            Import contacts from CSV
          </h2>
          <p className="text-sm text-ink-muted">
            {stage === "pick" &&
              "Pick a file. We check every row here before anything is sent to Resend."}
            {stage === "map" && `${fileName}: match each column to a contact field.`}
            {stage === "run" && "Sending contacts to Resend, a few at a time."}
            {stage === "done" && "Finished."}
          </p>
        </div>

        {stage === "pick" ? (
          <div className="grid gap-4">
            {options.connections.filter((c) => c.writable).length > 1 ? (
              <label className="grid gap-1.5 text-sm font-medium">
                Connection
                <select
                  value={connectionId}
                  onChange={(e) => {
                    setConnectionId(e.target.value);
                    setSegmentIds([]);
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
            {segments.length > 0 ? (
              <fieldset className="grid gap-1.5">
                <legend className="text-sm font-medium">
                  Add everyone to segments{" "}
                  <span className="font-normal text-ink-muted">(optional)</span>
                </legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
                  {segments.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={segmentIds.includes(s.id)}
                        onChange={(e) =>
                          setSegmentIds((ids) =>
                            e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id),
                          )
                        }
                        className="size-4 accent-[var(--accent)]"
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
              Update contacts that already exist (otherwise they are skipped)
            </label>
            <label className="grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed border-line bg-canvas-sunken px-4 py-8 text-center text-sm transition-colors hover:border-accent focus-within:border-accent">
              <FileUp aria-hidden className="size-6 text-ink-muted" />
              <span className="font-semibold">Choose a CSV file</span>
              <span className="text-xs text-ink-muted">
                Up to {IMPORT_MAX_ROWS.toLocaleString()} rows and 5 MB. Comma, semicolon or tab
                separated.
              </span>
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv"
                className="sr-only"
                aria-label="CSV file"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
            </label>
            {pickError ? (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
                {pickError}
              </p>
            ) : null}
          </div>
        ) : null}

        {stage === "map" && csv && built ? (
          <div className="grid gap-4">
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[32rem] text-left text-[13px]">
                <thead className="bg-canvas-sunken text-xs text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">CSV column</th>
                    <th className="px-3 py-2 font-semibold">Example</th>
                    <th className="px-3 py-2 font-semibold">Goes to</th>
                  </tr>
                </thead>
                <tbody>
                  {csv.headers.map((header, col) => (
                    <tr key={col} className="border-t border-line">
                      <td className="px-3 py-1.5 font-medium">{header || `Column ${col + 1}`}</td>
                      <td className="max-w-[12rem] truncate px-3 py-1.5 text-ink-muted">
                        {csv.rows
                          .slice(0, 3)
                          .map((r) => r[col])
                          .filter(Boolean)
                          .join(", ")}
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          aria-label={`Field for ${header}`}
                          value={mapping[col] ?? "skip"}
                          onChange={(e) => {
                            const value = e.target.value as ColumnTarget;
                            setMapping((m) => {
                              const next = [...m];
                              if (value !== "skip") {
                                next.forEach((t, i) => {
                                  if (t === value) next[i] = "skip";
                                });
                              }
                              next[col] = value;
                              return next;
                            });
                          }}
                          className="h-8 w-44 rounded-control border border-line bg-canvas px-2 text-xs"
                        >
                          <option value="skip">Skip this column</option>
                          <option value="email">Email</option>
                          <option value="firstName">First name</option>
                          <option value="lastName">Last name</option>
                          {properties.map((p) => (
                            <option key={p.id} value={`property:${p.key}`}>
                              Property: {p.key}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!mappedEmail ? (
              <p
                role="alert"
                className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink"
              >
                Choose which column holds the email address.
              </p>
            ) : (
              <div
                className="grid gap-2 rounded-lg bg-canvas-sunken px-3 py-2.5 text-sm"
                data-testid="import-summary"
              >
                <p>
                  <strong>{built.valid.length.toLocaleString()}</strong> of{" "}
                  {csv.rows.length.toLocaleString()} rows are ready to import
                  {built.errors.length > 0 ? (
                    <>
                      ;{" "}
                      <strong className="text-danger-ink">
                        {built.errors.length.toLocaleString()}
                      </strong>{" "}
                      have problems and will be skipped
                    </>
                  ) : null}
                  .
                  {built.valid.length > IMPORT_INLINE_LIMIT
                    ? " This is a big one, so it runs in the background."
                    : ""}
                </p>
                {built.errors.length > 0 ? (
                  <ul className="grid max-h-32 gap-0.5 overflow-y-auto text-xs text-ink-secondary">
                    {built.errors.slice(0, 20).map((e) => (
                      <li key={`${e.row}-${e.message}`}>
                        Line {e.row}
                        {e.email ? ` (${e.email})` : ""}: {e.message}
                      </li>
                    ))}
                    {built.errors.length > 20 ? (
                      <li>…and {built.errors.length - 20} more.</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {stage === "run" || stage === "done" ? (
          <div className="grid gap-3" aria-live="polite">
            <div
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={stage === "done" ? 100 : percent}
              className="h-2 overflow-hidden rounded-full bg-canvas-sunken"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${stage === "done" ? 100 : percent}%` }}
              />
            </div>
            <p className="text-sm text-ink-secondary" data-testid="import-progress">
              {stage === "run" ? (
                <>
                  <Loader2 aria-hidden className="mr-1 inline size-3.5 animate-spin" />
                  {totals.processed.toLocaleString()} of {total.toLocaleString()} rows handled
                </>
              ) : (
                "Done."
              )}{" "}
              {totals.created.toLocaleString()} added, {totals.updated.toLocaleString()} updated,{" "}
              {totals.skipped.toLocaleString()} skipped, {totals.failed.toLocaleString()} with
              problems.
            </p>
            {runError ? (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
                {runError}
              </p>
            ) : null}
            {errors.length > 0 ? (
              <div className="grid gap-2">
                <ul className="grid max-h-40 gap-0.5 overflow-y-auto rounded-lg bg-canvas-sunken px-3 py-2 text-xs text-ink-secondary">
                  {errors.slice(0, 50).map((e, i) => (
                    <li key={`${e.row}-${i}`}>
                      Line {e.row}
                      {e.email ? ` (${e.email})` : ""}: {e.message}
                    </li>
                  ))}
                  {errors.length > 50 ? (
                    <li>…and {errors.length - 50} more in the download.</li>
                  ) : null}
                </ul>
                <button
                  type="button"
                  onClick={downloadErrors}
                  className="inline-flex h-8 w-fit items-center gap-1.5 rounded-control border border-line px-3 text-xs font-semibold"
                >
                  <Download aria-hidden className="size-3.5" /> Download problems as CSV
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {stage === "pick" ? (
            <button
              type="button"
              onClick={close}
              className="h-9 rounded-control border border-line px-3 text-sm font-medium"
            >
              Cancel
            </button>
          ) : null}
          {stage === "map" ? (
            <>
              <button
                type="button"
                onClick={() => setStage("pick")}
                className="h-9 rounded-control border border-line px-3 text-sm font-medium"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!mappedEmail || !built || built.valid.length === 0}
                onClick={() => void start()}
                className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink disabled:opacity-50"
              >
                Import {built ? built.valid.length.toLocaleString() : 0} contacts
              </button>
            </>
          ) : null}
          {stage === "run" ? (
            <button
              type="button"
              onClick={() => {
                cancelled.current = true;
                if (background) onOpenChange(false);
              }}
              className="h-9 rounded-control border border-line px-3 text-sm font-medium"
            >
              {background ? "Close (keeps running)" : "Stop after this batch"}
            </button>
          ) : null}
          {stage === "done" ? (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-control bg-accent-fill px-3 text-sm font-semibold text-accent-ink"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
