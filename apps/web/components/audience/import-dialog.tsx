"use client";

import { Download, FileUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  appendImportRowsAction,
  createContactImportAction,
  getContactImportAction,
  importContactsBatchAction,
  importFinishedAction,
  startContactImportAction,
} from "@/app/(app)/[orgSlug]/audience/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildImportRows,
  errorsToCsv,
  guessMapping,
  parseCsv,
  type ColumnTarget,
  type ParsedCsv,
} from "@/lib/audience/csv";
import type { AudienceOptionsDTO, ImportRowError } from "@/lib/dto/audience";
import { IMPORT_BATCH_SIZE, IMPORT_INLINE_LIMIT, IMPORT_MAX_ROWS } from "@/lib/validation/audience";
import { audienceError } from "./errors";
import { ConnectionSelect, firstWritable } from "./connection-select";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
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

/**
 * CSV import (PRD §5.9). The file is parsed and checked in the browser (nothing invalid is
 * sent), then small imports run as batches straight from here with a progress bar; large ones
 * are uploaded once and processed by a throttled background job that this dialog watches.
 */
export function ImportDialog({
  orgSlug,
  options,
  open,
  onOpenChange,
}: {
  orgSlug: string;
  options: AudienceOptionsDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
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
    if (file.size > MAX_FILE_BYTES)
      return setPickError("That file is over 5 MB. Split it and import the parts.");
    const parsed = parseCsv(await file.text());
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      return setPickError("We couldn't find any rows. The first line should be the column names.");
    }
    if (parsed.rows.length > IMPORT_MAX_ROWS) {
      return setPickError(
        `That file has ${parsed.rows.length.toLocaleString()} rows. The limit is ${IMPORT_MAX_ROWS.toLocaleString()} per import.`,
      );
    }
    setFileName(file.name);
    setCsv(parsed);
    setMapping(
      guessMapping(
        parsed.headers,
        properties.map((p) => p.key),
      ),
    );
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
        const result = await importContactsBatchAction(orgSlug, {
          connectionId,
          rows: batch,
          segmentIds,
          updateExisting,
        });
        if (!result.ok) {
          setRunError(audienceError(result.error));
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
      await importFinishedAction(orgSlug, { connectionId, ...sum });
    },
    [orgSlug, connectionId, segmentIds, updateExisting],
  );

  const runJob = useCallback(
    async (rows: NonNullable<typeof built>["valid"], clientErrors: ImportRowError[]) => {
      setBackground(true);
      const created = await createContactImportAction(orgSlug, {
        connectionId,
        segmentIds,
        updateExisting,
        total: rows.length,
      });
      if (!created.ok) return setRunError(audienceError(created.error));
      const { importId } = created.data;
      for (let i = 0; i < rows.length; i += UPLOAD_CHUNK) {
        const sent = await appendImportRowsAction(orgSlug, {
          importId,
          rows: rows.slice(i, i + UPLOAD_CHUNK),
        });
        if (!sent.ok) return setRunError(audienceError(sent.error));
      }
      const started = await startContactImportAction(orgSlug, { importId });
      if (!started.ok) return setRunError(audienceError(started.error));
      for (;;) {
        await sleep(2000);
        const status = await getContactImportAction(orgSlug, { importId });
        if (!status.ok) return setRunError(audienceError(status.error));
        const s = status.data;
        // Rows the browser already rejected count as handled and as problems.
        setTotals({
          created: s.created,
          updated: s.updated,
          skipped: s.skipped,
          failed: s.errorCount + clientErrors.length,
          processed: s.processed + clientErrors.length,
        });
        setErrors([...clientErrors, ...s.errors]);
        if (s.status === "completed") return;
        if (s.status === "failed")
          return setRunError(
            "The import stopped: the account needs attention. What was imported so far is kept.",
          );
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
    router.refresh();
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && running && !background) cancelled.current = true;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Import contacts from CSV</DialogTitle>
          <DialogDescription>
            {stage === "pick" &&
              "Pick a file. We check every row here before anything is sent to Resend."}
            {stage === "map" && `${fileName}: match each column to a contact field.`}
            {stage === "run" && "Sending contacts to Resend, a few at a time."}
            {stage === "done" && "Finished."}
          </DialogDescription>
        </DialogHeader>

        {stage === "pick" ? (
          <div className="grid gap-4">
            {options.connections.length > 1 ? (
              <ConnectionSelect
                id="import-connection"
                connections={options.connections}
                value={connectionId}
                onChange={(id) => {
                  setConnectionId(id);
                  setSegmentIds([]);
                }}
              />
            ) : null}
            {segments.length > 0 ? (
              <fieldset className="grid gap-1.5">
                <legend className="text-sm leading-none font-medium">
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
            <label className="grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-canvas-sunken px-4 py-8 text-center text-sm transition-colors focus-within:border-accent hover:border-accent">
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
              <p
                role="alert"
                className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink"
              >
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
                        <Select
                          value={mapping[col] ?? "skip"}
                          onValueChange={(value) =>
                            setMapping((m) => {
                              const next = [...m];
                              // A field can only take one column.
                              if (value !== "skip")
                                next.forEach((t, i) => t === value && (next[i] = "skip"));
                              next[col] = value as ColumnTarget;
                              return next;
                            })
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={`Field for ${header}`}
                            className="w-44"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Skip this column</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="firstName">First name</SelectItem>
                            <SelectItem value="lastName">Last name</SelectItem>
                            {properties.map((p) => (
                              <SelectItem key={p.id} value={`property:${p.key}`}>
                                Property: {p.key}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-soft"
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
              <p
                role="alert"
                className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink"
              >
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={downloadErrors}
                >
                  <Download aria-hidden /> Download problems as CSV
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {stage === "pick" ? (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          ) : null}
          {stage === "map" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setStage("pick")}>
                Back
              </Button>
              <Button
                type="button"
                className="font-bold"
                disabled={!mappedEmail || !built || built.valid.length === 0}
                onClick={() => void start()}
              >
                Import {built ? built.valid.length.toLocaleString() : 0} contacts
              </Button>
            </>
          ) : null}
          {stage === "run" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                cancelled.current = true;
                if (background) {
                  toast.message("The import keeps running in the background.");
                  onOpenChange(false);
                }
              }}
            >
              {background ? "Close (keeps running)" : "Stop after this batch"}
            </Button>
          ) : null}
          {stage === "done" ? (
            <Button type="button" className="font-bold" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
