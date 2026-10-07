import { cn } from "@/lib/utils";

/** Force light or dark tokens for a marketing band, independent of the page theme. */
export function Tone({
  tone,
  className,
  children,
  as: Tag = "div",
  id,
}: {
  tone: "light" | "dark";
  className?: string;
  children: React.ReactNode;
  as?: "div" | "section" | "footer";
  id?: string;
}) {
  return (
    <Tag id={id} data-theme={tone} className={cn("bg-canvas text-ink", className)}>
      {children}
    </Tag>
  );
}

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1180px] px-5 sm:px-8", className)}>{children}</div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-accent-fill uppercase">
      {children}
    </p>
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
        "grid gap-4",
        align === "center" && "mx-auto max-w-2xl justify-items-center text-center",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Tag className="font-display text-[2rem] leading-[1.05] font-bold tracking-[-0.04em] text-balance sm:text-5xl">
        {title}
      </Tag>
      {description ? (
        <p className="max-w-[42ch] text-base leading-7 text-pretty text-ink-secondary sm:text-lg sm:leading-8">
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
      <div className="rounded-2xl border border-line/80 bg-surface p-4 shadow-md sm:p-5">
        {children}
      </div>
      {label ? <figcaption className="px-1 text-xs text-ink-muted">{label}</figcaption> : null}
    </figure>
  );
}
