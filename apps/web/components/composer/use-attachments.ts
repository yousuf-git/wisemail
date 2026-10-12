"use client";

import { useCallback, useRef, useState } from "react";

import {
  confirmUploadAction,
  createUploadAction,
  removeAttachmentAction,
} from "@/app/(app)/[orgSlug]/compose/actions";
import type { AttachmentDTO } from "@/lib/dto/mail";
import { MAX_ATTACHMENT_BYTES, MAX_EMAIL_BYTES } from "@/lib/validation/mail";
import { friendlyError } from "./errors";

export const MAX_ATTACHMENTS = 20;

export type UploadItem = {
  /** Local key; the attachment id once known. */
  key: string;
  id: string | null;
  filename: string;
  size: number;
  contentType: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  dto?: AttachmentDTO;
};

const FORBIDDEN_HEADERS = new Set(["content-length", "host"]);

/** PUT to a presigned URL with progress. Rejects on network failure, non-2xx or abort. */
export function putFile(
  url: string,
  headers: Record<string, string>,
  file: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      if (!FORBIDDEN_HEADERS.has(name.toLowerCase())) xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`status ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

export const formatBytes = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

const fromDto = (dto: AttachmentDTO): UploadItem => ({
  key: dto.id,
  id: dto.id,
  filename: dto.filename,
  size: dto.size,
  contentType: dto.contentType,
  progress: 1,
  status: "done",
  dto,
});

/** Presigned browser-to-storage uploads for the draft (TRD §2.13), with limits checked first. */
export function useAttachments({
  orgSlug,
  initial,
  ensureDraft,
  onError,
}: {
  orgSlug: string;
  initial: AttachmentDTO[];
  ensureDraft: () => Promise<string | null>;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>(() => initial.map(fromDto));
  const itemsRef = useRef(items);
  const aborts = useRef(new Map<string, AbortController>());

  const update = useCallback((next: (items: UploadItem[]) => UploadItem[]) => {
    itemsRef.current = next(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  const patch = useCallback(
    (key: string, changes: Partial<UploadItem>) =>
      update((list) => list.map((item) => (item.key === key ? { ...item, ...changes } : item))),
    [update],
  );

  const upload = useCallback(
    async (file: File, key: string) => {
      const controller = new AbortController();
      aborts.current.set(key, controller);
      const fail = (message: string) => patch(key, { status: "error", error: message });
      try {
        const draftId = await ensureDraft();
        if (!draftId) return fail("Couldn't save the draft, so the file can't attach yet.");
        const contentType = file.type || "application/octet-stream";
        const started = await createUploadAction(orgSlug, {
          draftId,
          filename: file.name,
          size: file.size,
          contentType,
        });
        if (!started.ok) return fail(friendlyError(started.error).message);
        const { attachmentId, uploadUrl, headers } = started.data;
        patch(key, { id: attachmentId });
        await putFile(
          uploadUrl,
          headers,
          file,
          (progress) => patch(key, { progress }),
          controller.signal,
        );
        const confirmed = await confirmUploadAction(orgSlug, { draftId, attachmentId });
        if (!confirmed.ok) return fail(friendlyError(confirmed.error).message);
        patch(key, {
          key: confirmed.data.id,
          id: confirmed.data.id,
          progress: 1,
          status: "done",
          dto: confirmed.data,
        });
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        fail("The upload didn't finish. Check your connection and attach the file again.");
      } finally {
        aborts.current.delete(key);
      }
    },
    [ensureDraft, orgSlug, patch],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      let count = itemsRef.current.filter((i) => i.status !== "error").length;
      let bytes = itemsRef.current
        .filter((i) => i.status !== "error")
        .reduce((sum, i) => sum + i.size, 0);
      const accepted: { file: File; key: string }[] = [];
      for (const file of files) {
        if (file.size === 0) {
          onError(`${file.name} is empty, so it wasn't attached.`);
        } else if (file.size > MAX_ATTACHMENT_BYTES) {
          onError(`${file.name} is over 40 MB. Share large files as a link instead.`);
        } else if (bytes + file.size > MAX_EMAIL_BYTES) {
          onError(`An email can carry at most 40 MB of attachments, so ${file.name} didn't fit.`);
        } else if (count >= MAX_ATTACHMENTS) {
          onError(`An email can carry at most ${MAX_ATTACHMENTS} attachments.`);
        } else {
          count += 1;
          bytes += file.size;
          accepted.push({ file, key: `local-${crypto.randomUUID()}` });
        }
      }
      if (!accepted.length) return;
      update((list) => [
        ...list,
        ...accepted.map(({ file, key }) => ({
          key,
          id: null,
          filename: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
          progress: 0,
          status: "uploading" as const,
        })),
      ]);
      for (const { file, key } of accepted) void upload(file, key);
    },
    [onError, update, upload],
  );

  const remove = useCallback(
    async (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (!item) return;
      aborts.current.get(key)?.abort();
      update((list) => list.filter((i) => i.key !== key));
      if (item.id) {
        const draftId = await ensureDraft();
        if (draftId) await removeAttachmentAction(orgSlug, { draftId, attachmentId: item.id });
      }
    },
    [ensureDraft, orgSlug, update],
  );

  const ready = items.filter((i) => i.status === "done");
  return {
    items,
    addFiles,
    remove,
    uploading: items.some((i) => i.status === "uploading"),
    doneIds: ready.map((i) => i.id!).filter(Boolean),
    totalBytes: ready.reduce((sum, i) => sum + i.size, 0),
    reset: (dtos: AttachmentDTO[]) => update(() => dtos.map(fromDto)),
  };
}
