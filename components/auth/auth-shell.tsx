import Link from "next/link";
import { Mail } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <Link href="/" className="flex items-center gap-2.5 text-ink" aria-label="Go to the Wisemail home page">
        <span className="grid size-9 place-items-center rounded-md bg-accent text-accent-ink shadow-glow">
          <Mail className="size-5" aria-hidden />
        </span>
        <span className="text-lg font-bold tracking-[-0.02em]">Wisemail</span>
      </Link>

      <div className="w-full max-w-[26rem] rounded-xl border border-line bg-surface p-6 shadow-md sm:p-8">
        <div className="mb-6 flex flex-col gap-1.5">
          <h1 className="text-[1.75rem] leading-[2.125rem] font-bold tracking-[-0.02em] text-balance">
            {title}
          </h1>
          <p className="text-ink-muted">{description}</p>
        </div>
        {children}
      </div>

      {footer ? <p className="text-sm text-ink-muted">{footer}</p> : null}
      <ThemeToggle />
    </main>
  );
}

export function FormAlert({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
      {children}
    </p>
  );
}
