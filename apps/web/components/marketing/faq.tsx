"use client";

import gsap from "gsap";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { faqItems } from "./faq-items";
import { Reveal } from "./reveal";
import { Container, SectionHeading, Tone } from "./section";

const landingFaq = faqItems.filter((f) =>
  [
    "Do I still need Resend?",
    "Is my API key safe?",
    "What counts as a tracked email?",
    "Does AI read my email?",
    "Is there a free trial?",
  ].includes(f.q),
);

function FaqItem({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  const buttonId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const inner = innerRef.current;
    if (!panel || !inner) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const height = open ? inner.scrollHeight : 0;

    if (reduced) {
      gsap.set(panel, { height: open ? "auto" : 0, opacity: open ? 1 : 0 });
      return;
    }

    gsap.to(panel, {
      height,
      opacity: open ? 1 : 0,
      duration: 0.45,
      ease: "power3.inOut",
      overwrite: "auto",
      onComplete: () => {
        if (open) gsap.set(panel, { height: "auto" });
      },
    });
  }, [open]);

  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="font-display text-base font-semibold tracking-[-0.015em] sm:text-lg">
          {q}
        </span>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full bg-canvas-sunken text-ink-muted transition-transform duration-500 ease-soft",
            open && "rotate-180 bg-accent-soft text-accent-fill",
          )}
        >
          <ChevronDown className="size-4" aria-hidden />
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        ref={panelRef}
        className="overflow-hidden opacity-0"
        style={{ height: 0 }}
      >
        <div ref={innerRef} className="pr-12 pb-5">
          <p className="text-[0.9375rem] leading-7 text-ink-secondary">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq({
  items,
  title = "Questions, short answers",
}: {
  items?: typeof faqItems;
  title?: string;
}) {
  const list = items ?? landingFaq;
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <Tone tone="dark" as="section" id="faq" className="scroll-mt-28 py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
        <Reveal>
          <SectionHeading eyebrow="FAQ" title={title} />
        </Reveal>
        <Reveal delay={0.08}>
          <div className="rounded-[1.75rem] border border-line/70 bg-surface px-5 shadow-sm sm:px-7">
            {list.map((item, i) => (
              <FaqItem
                key={item.q}
                q={item.q}
                a={item.a}
                open={openIndex === i}
                onToggle={() => setOpenIndex((cur) => (cur === i ? null : i))}
              />
            ))}
          </div>
        </Reveal>
      </Container>
    </Tone>
  );
}
