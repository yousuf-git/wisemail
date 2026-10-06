import Link from "next/link";

import { cn } from "@/lib/utils";

export function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 50 39"
      aria-hidden
      className={cn("size-8", className)}
    >
      <path
        d="M16.4992 2H37.5808L22.0816 24.9729H1L16.4992 2Z"
        className="fill-accent-fill"
      />
      <path
        d="M17.4231 27.1022L11.4199 36.0002H33.5015L49.0007 13.0273H32.7031L23.2071 27.1022H17.4231Z"
        className="fill-glow"
      />
    </svg>
  );
}

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
      <Logomark />
      Wisemail
    </Link>
  );
}
