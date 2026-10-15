import * as m from "motion/react-m";

import { cn } from "@/lib/utils";

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
    <div className={cn("mx-auto w-full max-w-[1200px] px-5 sm:px-8", className)}>{children}</div>
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
      <Tag className="font-display text-[2.125rem] leading-[1.04] font-extrabold tracking-[-0.045em] text-balance sm:text-5xl lg:text-[3.5rem]">
        {title}
      </Tag>
      {description ? (
        <p className="max-w-[46ch] text-base leading-7 text-pretty text-ink-secondary sm:text-lg sm:leading-8">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export const easeOut = [0.16, 1, 0.3, 1] as const;

/** Fade-and-rise once when scrolled into view. Reduced motion drops the rise (MotionConfig). */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.8, delay, ease: easeOut }}
    >
      {children}
    </m.div>
  );
}
