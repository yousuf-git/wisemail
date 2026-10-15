import { Plus } from "lucide-react";
import { useScroll, useTransform } from "motion/react";
import * as m from "motion/react-m";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { faqItems } from "./faq-items";
import { FeatureGrid } from "./feature-grid";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { PricingPlans } from "./pricing-plans";
import { Problem } from "./problem";
import { Container, Reveal, SectionHeading, Tone } from "./section";
import { Showcase } from "./showcase";
import { useHashGlide } from "./smooth-scroll";

/**
 * The feature grid scrolls normally until its bottom edge meets the viewport, then holds
 * still and sinks back while Pricing slides up over it.
 */
function FeaturesUnderPricing() {
  const pinRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const { scrollYProgress } = useScroll({
    target: pricingRef,
    offset: ["start end", "start start"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);
  const shade = useTransform(scrollYProgress, [0, 1], [0, 0.45]);

  useLayoutEffect(() => {
    const el = pinRef.current;
    if (!el) return;
    const measure = () => setTop(Math.min(0, window.innerHeight - el.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className="relative">
      <div ref={pinRef} className="sticky z-0" style={{ top }}>
        <m.div className="origin-bottom" style={{ scale }}>
          <FeatureGrid />
        </m.div>
        <m.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[#141311]"
          style={{ opacity: shade }}
        />
      </div>
      <div ref={pricingRef} className="relative z-10">
        <Pricing />
      </div>
    </div>
  );
}

function Pricing() {
  return (
    <Tone
      tone="light"
      as="section"
      id="pricing"
      className="relative scroll-mt-24 rounded-t-[2.5rem] py-24 shadow-[0_-30px_70px_-30px_rgb(20_19_17_/0.45)] sm:rounded-t-[3.5rem] sm:py-32"
    >
      <Container className="grid gap-12">
        <Reveal>
          <SectionHeading
            eyebrow="Pricing"
            title="Start free. Grow when you do."
            description="One plan covers transactional and marketing mail on every Resend account you connect."
          />
        </Reveal>
        <Reveal delay={0.1}>
          <PricingPlans />
        </Reveal>
      </Container>
    </Tone>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Tone tone="light" as="section" id="faq" className="scroll-mt-24 border-t border-line py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading
            title="Questions, answered plainly."
            description="Resend stays your sender. Here is what Wisemail does around it."
          />
        </div>
        <ul className="grid">
          {faqItems.map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={item.q} className="border-b border-line first:border-t">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-6 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span className="text-base font-semibold sm:text-lg">{item.q}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full border border-line transition-[transform,background-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      isOpen && "rotate-45 bg-ink text-canvas",
                    )}
                  >
                    <Plus className="size-4" />
                  </span>
                </button>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="min-h-0 overflow-hidden">
                    <p className="max-w-[60ch] pb-6 text-[0.9375rem] leading-7 text-ink-secondary">
                      {item.a}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </Tone>
  );
}

export function LandingPage() {
  useHashGlide();
  return (
    <>
      <Hero />
      <Problem />
      <Showcase />
      <HowItWorks />
      <FeaturesUnderPricing />
      <Faq />
    </>
  );
}
