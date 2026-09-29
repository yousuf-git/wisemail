"use client";

import { AlertCircle, File as FileIcon, Paperclip, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes, type UploadItem } from "./use-attachments";

export function AttachButton({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid="attach-input"
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Paperclip aria-hidden /> Attach
      </Button>
    </>
  );
}

export function AttachmentList({
  items,
  onRemove,
  disabled,
}: {
  items: UploadItem[];
  onRemove: (key: string) => void;
  disabled?: boolean;
}) {
  if (!items.length) return null;
  return (
    <ul aria-label="Attachments" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item.key}
          data-status={item.status}
          className={cn(
            "relative flex max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[0.8125rem]",
            item.status === "error" && "border-danger bg-danger-soft",
          )}
        >
          {item.status === "error" ? (
            <AlertCircle aria-hidden className="size-4 shrink-0 text-danger-ink" />
          ) : (
            <FileIcon aria-hidden className="size-4 shrink-0 text-ink-muted" />
          )}
          <span className="grid min-w-0">
            <span className="truncate font-medium" title={item.filename}>
              {item.filename}
            </span>
            <span
              className={cn(
                "text-xs",
                item.status === "error" ? "text-danger-ink" : "text-ink-muted",
              )}
            >
              {item.status === "error"
                ? item.error
                : item.status === "uploading"
                  ? `Uploading ${Math.round(item.progress * 100)}%`
                  : formatBytes(item.size)}
            </span>
          </span>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Remove ${item.filename}`}
            onClick={() => onRemove(item.key)}
            className="grid size-6 shrink-0 place-items-center rounded-full outline-none hover:bg-line-strong/60 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X aria-hidden className="size-3.5" />
          </button>
          {item.status === "uploading" ? (
            <span
              role="progressbar"
              aria-label={`Uploading ${item.filename}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(item.progress * 100)}
              className="absolute inset-x-0 bottom-0 h-0.5 bg-line"
            >
              <span
                className="block h-full bg-accent transition-[width] duration-150"
                style={{ width: `${Math.round(item.progress * 100)}%` }}
              />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
