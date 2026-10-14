import { Check, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Attachment } from "@/lib/api";
import { cn } from "@/lib/utils";

import { formatBytes } from "./format";

export function startDownload(url: string) {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.setAttribute("aria-hidden", "true");
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 60_000);
}

function fileKind(contentType: string, filename: string): { label: string; color: string } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const type = contentType.toLowerCase();
  if (type === "application/pdf" || ext === "pdf") return { label: "PDF", color: "#EF4444" };
  if (type.startsWith("image/")) return { label: "IMG", color: "#8B5CF6" };
  if (/(sheet|excel|csv)/.test(type) || ["xls", "xlsx", "csv", "ods"].includes(ext))
    return { label: "XLS", color: "#10B981" };
  if (
    /(word|document|rtf|opendocument\.text)/.test(type) ||
    ["doc", "docx", "odt", "rtf"].includes(ext)
  )
    return { label: "DOC", color: "#0EA5E9" };
  if (
    /(zip|compressed|tar|gzip|rar|7z)/.test(type) ||
    ["zip", "gz", "tar", "rar", "7z"].includes(ext)
  )
    return { label: "ZIP", color: "#6E6B65" };
  return { label: (ext.slice(0, 3) || "FILE").toUpperCase(), color: "#6E6B65" };
}

function middleTruncate(name: string, max = 30): string {
  if (name.length <= max) return name;
  const keep = max - 1;
  const ext = /\.[a-z0-9]{1,5}$/i.exec(name)?.[0].length ?? 0;
  const tail = Math.min(Math.max(ext + 5, Math.ceil(keep * 0.4)), keep - 1);
  return `${name.slice(0, keep - tail)}…${name.slice(name.length - tail)}`;
}

function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const kind = fileKind(attachment.contentType, attachment.filename);
  const size = formatBytes(attachment.size);

  const body = (
    <>
      <span
        aria-hidden
        className="grid h-[30px] w-[26px] flex-none place-items-center rounded-[6px] text-[8.5px] font-extrabold text-white"
        style={{ backgroundColor: kind.color }}
      >
        {kind.label}
      </span>
      <span className="min-w-0">
        <span className="block max-w-[190px] truncate font-semibold">
          {middleTruncate(attachment.filename)}
        </span>
        <small className="block text-[11.5px] text-ink-muted">
          {attachment.available ? size : "No longer available at Resend"}
        </small>
      </span>
    </>
  );

  if (!attachment.available) {
    return (
      <span
        data-testid="attachment-chip"
        className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface py-[7px] pr-2.5 pl-2 text-[12.5px] opacity-55 shadow-[0_0_0_1px_var(--line)]"
      >
        {body}
      </span>
    );
  }

  return (
    <a
      href={attachment.downloadUrl}
      data-testid="attachment-chip"
      title={attachment.filename}
      aria-label={`Download ${attachment.filename}, ${size}`}
      onClick={(event) => {
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
          event.preventDefault();
          startDownload(attachment.downloadUrl);
        }
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 2200);
      }}
      className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface py-[7px] pr-2.5 pl-2 text-left text-[12.5px] shadow-[0_0_0_1px_var(--line)] outline-none hover:-translate-y-px hover:shadow-[0_0_0_1px_var(--line-strong)] focus-visible:ring-2 focus-visible:ring-accent"
    >
      {body}
      {done ? (
        <Check aria-hidden className="size-4 text-success-ink" />
      ) : (
        <Download aria-hidden className="size-4 text-ink-muted" />
      )}
    </a>
  );
}

export function AttachmentChips({
  attachments,
  className,
}: {
  attachments: Attachment[];
  className?: string;
}) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  const listed = attachments.filter((a) => !a.embedded);
  if (listed.length === 0) return null;
  const thumbs = listed.filter((a) => a.thumbnailUrl && a.available);
  const chips = listed.filter((a) => !(a.thumbnailUrl && a.available));
  const downloadable = listed.filter((a) => a.available);

  return (
    <div className={cn("grid gap-2", className)} data-testid="attachments">
      <div className="flex flex-wrap items-center gap-2">
        {thumbs.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setPreview(a)}
            data-testid="attachment-thumb"
            aria-label={`Preview ${a.filename}`}
            className="size-24 flex-none overflow-hidden rounded-md bg-canvas-sunken shadow-[0_0_0_1px_var(--line)] outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-accent"
          >
            <img
              src={a.thumbnailUrl!}
              alt={a.filename}
              referrerPolicy="no-referrer"
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        ))}
        {chips.map((a) => (
          <AttachmentChip key={a.id} attachment={a} />
        ))}
      </div>
      {listed.length >= 3 && downloadable.length >= 3 ? (
        <button
          type="button"
          className="justify-self-start text-xs font-medium text-accent-fill hover:underline"
          onClick={() => {
            downloadable.forEach((a, i) =>
              setTimeout(() => startDownload(a.downloadUrl), i * 350),
            );
          }}
        >
          Download all ({downloadable.length})
        </button>
      ) : null}

      {preview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={preview.filename}
          className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4"
          onClick={() => setPreview(null)}
          onKeyDown={(e) => e.key === "Escape" && setPreview(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-[min(92vw,900px)] overflow-auto rounded-lg bg-surface p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{preview.filename}</p>
                <p className="text-xs text-ink-muted">{formatBytes(preview.size)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="h-8 rounded-control bg-accent-fill px-3 text-xs font-semibold text-accent-ink"
                  onClick={() => startDownload(preview.downloadUrl)}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="h-8 rounded-control border border-line px-3 text-xs font-medium"
                  onClick={() => setPreview(null)}
                >
                  Close
                </button>
              </div>
            </div>
            {preview.thumbnailUrl ? (
              <img
                src={preview.thumbnailUrl}
                alt={preview.filename}
                referrerPolicy="no-referrer"
                className="max-h-[65dvh] w-full rounded-md bg-canvas-sunken object-contain"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
