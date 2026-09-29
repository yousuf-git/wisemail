"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

/** Exactly what the preview iframe may do: open links in a new tab, nothing else (TRD §3). */
export const PREVIEW_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";
export const PREVIEW_CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'";

export type PreviewOptions = { dark?: boolean };

/** The document shown in the preview: a strict CSP first, then the draft's HTML. */
export function buildPreviewDocument(html: string, { dark = false }: PreviewOptions = {}) {
  const colors = dark ? "background:#1a1917;color:#f2efe9" : "background:#ffffff;color:#1f1e1c";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>html,body{margin:0}body{${colors};font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:${dark ? "#7dd3fc" : "#0369a1"}}blockquote{margin:0 0 0 4px;padding-left:12px;border-left:3px solid #c9c5bb}</style></head><body>${html}</body></html>`;
}

/**
 * Sandboxed live preview. No `allow-scripts`, no `allow-same-origin`: scripts in the draft never
 * run and the frame cannot reach this page's cookies or DOM.
 */
export function PreviewFrame({
  html,
  dark = false,
  width = "desktop",
  title = "Email preview",
  className,
}: {
  html: string;
  dark?: boolean;
  width?: "desktop" | "mobile";
  title?: string;
  className?: string;
}) {
  const srcDoc = useMemo(() => buildPreviewDocument(html, { dark }), [html, dark]);
  return (
    <div
      className={cn(
        "grid min-h-0 justify-items-center overflow-auto rounded-lg bg-canvas-sunken p-3",
        className,
      )}
    >
      <iframe
        title={title}
        data-testid="composer-preview"
        sandbox={PREVIEW_SANDBOX}
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className={cn(
          "h-full min-h-72 w-full rounded-md border border-line bg-white transition-[max-width] duration-200 ease-soft",
          width === "mobile" ? "max-w-[375px]" : "max-w-full",
        )}
      />
    </div>
  );
}
