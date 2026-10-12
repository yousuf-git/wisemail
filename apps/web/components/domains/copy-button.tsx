"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Copies `value` to the clipboard; the icon flips to a check for a moment. */
export function CopyButton({
  value,
  label,
  variant = "ghost",
  showLabel = false,
}: {
  value: string;
  /** What is being copied, for the accessible name and the toast ("DKIM value"). */
  label: string;
  variant?: "ghost" | "outline";
  showLabel?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it by hand.");
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={showLabel ? "sm" : "icon-sm"}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      onClick={copy}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {showLabel ? (copied ? "Copied" : "Copy") : null}
    </Button>
  );
}
