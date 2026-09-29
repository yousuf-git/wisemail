"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DownloadIcon } from "@/components/icons/animated";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AttachmentDTO } from "@/lib/dto/mail";
import { cn } from "@/lib/utils";
import { formatBytes } from "./format";

type FileKind = { label: string; color: string };

/** File-type badge (FED §5): PDF, doc, sheet, archive, image, other. Fixed hues, white letters. */
/**
 * Starts a download without leaving the thread: the authorized route answers with a redirect to a
 * presigned URL that carries `Content-Disposition: attachment; filename*=...`, so the browser saves
 * the file under its original name. A hidden iframe takes the navigation, so a failure (expired
 * link, revoked access) can never replace the page.
 */
export function startDownload(url: string) {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.setAttribute("aria-hidden", "true");
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 60_000);
}

export function fileKind(contentType: string, filename: string): FileKind {
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

/** Middle truncation that keeps the extension: `Quarterly-rep…final.pdf`. */
export function middleTruncate(name: string, max = 30): string {
  if (name.length <= max) return name;
  const keep = max - 1;
  const ext = /\.[a-z0-9]{1,5}$/i.exec(name)?.[0].length ?? 0;
  const tail = Math.min(Math.max(ext + 5, Math.ceil(keep * 0.4)), keep - 1);
  return `${name.slice(0, keep - tail)}…${name.slice(name.length - tail)}`;
}

function AttachmentChip({ attachment }: { attachment: AttachmentDTO }) {
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
        data-available="false"
        className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface py-[7px] pr-2.5 pl-2 text-[12.5px] opacity-55 shadow-[0_0_0_1px_var(--line)]"
      >
        {body}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={attachment.downloadUrl}
          data-testid="attachment-chip"
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
          className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface py-[7px] pr-2.5 pl-2 text-left text-[12.5px] shadow-[0_0_0_1px_var(--line)] transition-[transform,box-shadow] duration-150 outline-none hover:-translate-y-px hover:shadow-[0_0_0_1px_var(--line-strong),var(--shadow-sm)] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {body}
          {done ? (
            <Check aria-hidden className="size-4 text-success-ink" />
          ) : (
            <DownloadIcon aria-hidden size={16} className="text-ink-muted" />
          )}
        </a>
      </TooltipTrigger>
      <TooltipContent>{attachment.filename}</TooltipContent>
    </Tooltip>
  );
}

function Thumbnail({ attachment, onOpen }: { attachment: AttachmentDTO; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="attachment-thumb"
      aria-label={`Preview ${attachment.filename}`}
      className="size-24 flex-none overflow-hidden rounded-md bg-canvas-sunken shadow-[0_0_0_1px_var(--line)] transition-[transform,box-shadow] duration-150 outline-none hover:-translate-y-px hover:shadow-[0_0_0_1px_var(--line-strong),var(--shadow-sm)] focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- presigned URL, not optimizable */}
      <img
        src={attachment.thumbnailUrl!}
        alt={attachment.filename}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="size-full object-cover"
      />
    </button>
  );
}

/**
 * Attachments below a message: image thumbnails (click for a lightbox with Download) and
 * chips for everything else. Files placed in the body are not listed again. 3+ files get
 * "Download all".
 */
export function AttachmentChips({
  attachments,
  className,
}: {
  attachments: AttachmentDTO[];
  className?: string;
}) {
  const [preview, setPreview] = useState<AttachmentDTO | null>(null);
  const listed = attachments.filter((a) => !a.embedded);
  if (listed.length === 0) return null;
  const thumbs = listed.filter((a) => a.thumbnailUrl && a.available);
  const chips = listed.filter((a) => !(a.thumbnailUrl && a.available));
  const downloadable = listed.filter((a) => a.available);

  return (
    <TooltipProvider>
      <div className={cn("grid gap-2", className)} data-testid="attachments">
        <div className="flex flex-wrap items-center gap-2">
          {thumbs.map((a) => (
            <Thumbnail key={a.id} attachment={a} onOpen={() => setPreview(a)} />
          ))}
          {chips.map((a) => (
            <AttachmentChip key={a.id} attachment={a} />
          ))}
        </div>
        {listed.length >= 3 && downloadable.length >= 3 ? (
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto justify-self-start p-0 text-xs"
            onClick={() => {
              // One request per file, spaced so browsers do not drop the later ones.
              downloadable.forEach((a, i) =>
                setTimeout(() => startDownload(a.downloadUrl), i * 350),
              );
            }}
          >
            Download all ({downloadable.length})
          </Button>
        ) : null}

        <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="max-w-[min(92vw,900px)]">
            <DialogHeader>
              <DialogTitle className="truncate">{preview?.filename}</DialogTitle>
              <DialogDescription>{preview ? formatBytes(preview.size) : null}</DialogDescription>
            </DialogHeader>
            {preview?.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- presigned URL, not optimizable
              <img
                src={preview.thumbnailUrl}
                alt={preview.filename}
                referrerPolicy="no-referrer"
                className="max-h-[65dvh] w-full rounded-md bg-canvas-sunken object-contain"
              />
            ) : null}
            <DialogFooter>
              {preview ? (
                <Button asChild>
                  <a
                    href={preview.downloadUrl}
                    onClick={(event) => {
                      event.preventDefault();
                      startDownload(preview.downloadUrl);
                    }}
                  >
                    Download
                  </a>
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
