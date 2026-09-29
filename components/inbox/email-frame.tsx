"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  buildEmailSrcDoc,
  estimateFrameHeight,
  EMAIL_FRAME_REFERRER_POLICY,
  EMAIL_FRAME_SANDBOX,
} from "./email-frame-utils";

/**
 * Sanitized HTML (or the plain-text fallback) in a locked-down iframe: only popups are allowed
 * (links open in a new tab, never in ours), no scripts, no forms, no same-origin.
 */
export function EmailFrame({
  title,
  html,
  text,
}: {
  title: string;
  html: string | null;
  text: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const srcDoc = useMemo(
    () =>
      buildEmailSrcDoc(
        { html, text },
        { allowLocalImages: process.env.NODE_ENV === "development" },
      ),
    [html, text],
  );
  const estimate = useMemo(() => estimateFrameHeight({ html, text }), [html, text]);
  const canExpand = estimate >= 320;

  return (
    <div className="grid gap-1.5">
      <iframe
        title={title}
        srcDoc={srcDoc}
        sandbox={EMAIL_FRAME_SANDBOX}
        referrerPolicy={EMAIL_FRAME_REFERRER_POLICY}
        loading="lazy"
        style={{ height: expanded ? "min(85dvh, 1400px)" : `${Math.min(estimate, 520)}px` }}
        className="w-full rounded-md border border-line bg-white"
      />
      {canExpand ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="justify-self-start text-ink-muted"
          onClick={() => setExpanded((v) => !v)}
          aria-pressed={expanded}
        >
          {expanded ? <ChevronsDownUp aria-hidden /> : <ChevronsUpDown aria-hidden />}
          {expanded ? "Collapse message" : "Expand message"}
        </Button>
      ) : null}
    </div>
  );
}
