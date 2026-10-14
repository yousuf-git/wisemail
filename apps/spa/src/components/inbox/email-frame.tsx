import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import {
  buildEmailSrcDoc,
  estimateFrameHeight,
  EMAIL_FRAME_REFERRER_POLICY,
  EMAIL_FRAME_SANDBOX,
} from "./email-frame-utils";

/** Sanitized HTML (or plain-text fallback) in a locked-down iframe. */
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
        { allowLocalImages: import.meta.env.DEV },
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
        <button
          type="button"
          className="inline-flex items-center gap-1 justify-self-start text-xs font-medium text-ink-muted hover:text-ink"
          onClick={() => setExpanded((v) => !v)}
          aria-pressed={expanded}
        >
          {expanded ? <ChevronsDownUp aria-hidden className="size-3.5" /> : <ChevronsUpDown aria-hidden className="size-3.5" />}
          {expanded ? "Collapse message" : "Expand message"}
        </button>
      ) : null}
    </div>
  );
}
