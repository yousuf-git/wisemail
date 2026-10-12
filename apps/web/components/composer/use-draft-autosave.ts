"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { saveDraftAction } from "@/app/(app)/[orgSlug]/compose/actions";
import type { ActionError } from "@/lib/actions/result";
import type { DraftDTO } from "@/lib/dto/mail";

export type DraftFields = {
  senderId: string | null;
  threadId: string | null;
  inReplyToEmailId: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  mode: "rich" | "html" | "template";
  bodyHtml: string;
  scheduledAt: string | null;
  /** Template mode: the chosen template and the values typed for its variables. */
  templateId: string | null;
  templateVariables: Record<string, string>;
};

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export const AUTOSAVE_DELAY_MS = 1200;

export const fieldsKey = (fields: DraftFields) => JSON.stringify(fields);

export function draftToFields(draft: DraftDTO): DraftFields {
  return {
    senderId: draft.senderId,
    threadId: draft.threadId,
    inReplyToEmailId: draft.inReplyToEmailId,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    mode: draft.mode,
    bodyHtml: draft.bodyHtml,
    scheduledAt: draft.scheduledAt,
    templateId: draft.templateId ?? null,
    templateVariables: Object.fromEntries(
      Object.entries(draft.templateVariables ?? {}).map(([key, value]) => [
        key,
        String(value ?? ""),
      ]),
    ),
  };
}

/**
 * Debounced draft autosave with optimistic concurrency (TRD §2.12). Saves are serialized: the
 * version returned by one save is the one the next sends. A `conflict` stops autosave until the
 * caller adopts the latest draft (`adopt`). Nothing is written until the user changes something
 * (`baselineKey`), so opening the composer never leaves empty drafts behind.
 */
export function useDraftAutosave({
  orgSlug,
  initialDraft,
  fields,
  baselineKey,
  enabled,
  delay = AUTOSAVE_DELAY_MS,
  onConflict,
  onError,
}: {
  orgSlug: string;
  initialDraft: DraftDTO | null;
  fields: DraftFields;
  baselineKey: string;
  enabled: boolean;
  delay?: number;
  onConflict?: () => void;
  onError?: (error: ActionError) => void;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(
    initialDraft ? new Date(initialDraft.updatedAt) : null,
  );
  const key = fieldsKey(fields);

  const idRef = useRef<string | null>(initialDraft?.id ?? null);
  const versionRef = useRef<number | null>(initialDraft?.version ?? null);
  const savedKeyRef = useRef<string | null>(
    initialDraft ? fieldsKey(draftToFields(initialDraft)) : null,
  );
  const fieldsRef = useRef(fields);
  const keyRef = useRef(key);
  const enabledRef = useRef(enabled);
  const conflictRef = useRef(false);
  const inflight = useRef<Promise<void> | null>(null);
  const callbacks = useRef({ onConflict, onError });

  useEffect(() => {
    fieldsRef.current = fields;
    keyRef.current = key;
    enabledRef.current = enabled;
    callbacks.current = { onConflict, onError };
  });

  const saveNow = useCallback(
    async (force = false) => {
      if (inflight.current) await inflight.current;
      if (!enabledRef.current || conflictRef.current) return;
      const current = keyRef.current;
      const hasDraft = idRef.current !== null;
      if (!force && (current === savedKeyRef.current || (!hasDraft && current === baselineKey))) {
        return;
      }
      const payload = fieldsRef.current;
      const run = (async () => {
        setState("saving");
        const result = await saveDraftAction(orgSlug, {
          ...payload,
          ...(idRef.current ? { id: idRef.current, version: versionRef.current ?? 0 } : {}),
        });
        if (result.ok) {
          idRef.current = result.data.id;
          versionRef.current = result.data.version;
          savedKeyRef.current = fieldsKey(payload);
          setSavedAt(new Date(result.data.updatedAt));
          setState(keyRef.current === savedKeyRef.current ? "saved" : "idle");
          return;
        }
        if (result.error.code === "conflict") {
          conflictRef.current = true;
          setState("conflict");
          callbacks.current.onConflict?.();
          return;
        }
        setState("error");
        callbacks.current.onError?.(result.error);
      })();
      inflight.current = run;
      try {
        await run;
      } finally {
        inflight.current = null;
      }
    },
    [orgSlug, baselineKey],
  );

  useEffect(() => {
    if (!enabled || conflictRef.current) return;
    const timer = setTimeout(() => void saveNow(), delay);
    return () => clearTimeout(timer);
  }, [key, enabled, delay, saveNow]);

  // Best effort on the way out: keep what was typed in the last moments.
  useEffect(
    () => () => {
      if (enabledRef.current) void saveNow();
    },
    [saveNow],
  );

  /** Waits for any save in flight; resolves with the draft id (or null when none exists). */
  const flush = useCallback(async () => {
    await saveNow();
    return idRef.current;
  }, [saveNow]);

  /** Makes sure a draft exists (attachments belong to one) and returns its id. */
  const ensureDraft = useCallback(async () => {
    if (idRef.current) return idRef.current;
    await saveNow(true);
    return idRef.current;
  }, [saveNow]);

  /** Continue from a draft loaded from the server (reload after a conflict). */
  const adopt = useCallback((draft: DraftDTO) => {
    idRef.current = draft.id;
    versionRef.current = draft.version;
    savedKeyRef.current = fieldsKey(draftToFields(draft));
    conflictRef.current = false;
    setSavedAt(new Date(draft.updatedAt));
    setState("saved");
  }, []);

  /** After sending or discarding: nothing left to save, and the id is gone. */
  const forget = useCallback(() => {
    enabledRef.current = false;
    idRef.current = null;
    versionRef.current = null;
  }, []);

  return {
    state,
    savedAt,
    draftId: () => idRef.current,
    flush,
    ensureDraft,
    adopt,
    forget,
    /** Try again after an error. */
    retry: () => void saveNow(),
  };
}
