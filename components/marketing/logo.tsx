import { MailCheck } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Wisemail home"
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-lg font-extrabold tracking-[-0.02em] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-[10px] bg-accent-fill text-accent-ink"
      >
        <MailCheck className="size-[18px]" />
      </span>
      Wisemail
    </Link>
  );
}
