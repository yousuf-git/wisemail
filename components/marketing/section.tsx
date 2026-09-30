import { cn } from "@/lib/utils";

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1120px] px-4 sm:px-6", className)}>{children}</div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-[0.06em] text-accent-fill uppercase">{children}</p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  as: Tag = "h2",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        align === "center" && "mx-auto max-w-2xl justify-items-center text-center",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Tag className="text-[1.75rem] leading-[1.1] font-extrabold tracking-[-0.025em] text-balance sm:text-4xl">
        {title}
      </Tag>
      {description ? (
        <p className="max-w-[56ch] text-base leading-7 text-pretty text-ink-secondary">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Window-like frame the product vignettes sit in. */
export function Frame({
  className,
  children,
  label,
}: {
  className?: string;
  children: React.ReactNode;
  /** Small caption under the frame, e.g. "Sample data". */
  label?: string;
}) {
  return (
    <figure className={cn("grid gap-2", className)}>
      <div className="rounded-xl border border-line bg-surface p-4 shadow-md sm:p-5">
        {children}
      </div>
      {label ? <figcaption className="px-1 text-xs text-ink-muted">{label}</figcaption> : null}
    </figure>
  );
}
