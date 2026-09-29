import { Mail } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div className="flex flex-col items-center gap-5 rounded-xl border border-line bg-surface px-8 py-12 shadow-md sm:px-14">
        <span className="grid size-14 place-items-center rounded-lg bg-accent text-accent-ink shadow-glow">
          <Mail className="size-7" aria-hidden />
        </span>
        <h1 className="text-[1.75rem] leading-[2.125rem] font-bold tracking-[-0.02em]">
          Wisemail
        </h1>
        <p className="max-w-[34ch] text-ink-muted">
          Wiser insights and more control over your emails.
        </p>
      </div>
      <ThemeToggle />
    </main>
  );
}
