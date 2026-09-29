"use client";

import { useEffect, useRef } from "react";

export type MailShortcutHandlers = {
  next?: () => void;
  prev?: () => void;
  trash?: () => void;
  reply?: () => void;
  unread?: () => void;
  search?: () => void;
};

/** True when typing should win over shortcuts: form fields, editors, dialogs, menus. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true;
  return !!target.closest("[role=dialog],[role=menu],[role=listbox],.cm-editor,.tiptap");
}

const KEYS: Record<string, keyof MailShortcutHandlers> = {
  j: "next",
  k: "prev",
  e: "trash",
  "#": "trash",
  r: "reply",
  u: "unread",
  "/": "search",
};

/**
 * Inbox keys (FED §10): `j`/`k` next and previous conversation, `e` or `#` move to Trash, `r` reply,
 * `u` mark unread, `/` search. Ignored while typing, in dialogs, and with modifier keys.
 */
export function useMailShortcuts(handlers: MailShortcutHandlers, enabled = true) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const action = KEYS[event.key];
      const handler = action ? ref.current[action] : undefined;
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
