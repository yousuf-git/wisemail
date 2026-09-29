import { cn } from "@/lib/utils";

/** Page title (h1), optional description and a right-aligned actions slot. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-[2.125rem] font-bold tracking-[-0.02em]">{title}</h1>
        {description ? <p className="mt-1 max-w-[68ch] text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
