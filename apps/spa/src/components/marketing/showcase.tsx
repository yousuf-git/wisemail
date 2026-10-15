import { Activity, BellRing, Inbox, LineChart, Sparkles } from "lucide-react";
import { AnimatePresence, useMotionValueEvent, useScroll } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Wizi, type WiziMood } from "@/components/mascot/wizi";
import { cn } from "@/lib/utils";
import {
  ActivityPreview,
  AiPreview,
  AlertsPreview,
  InboxPreview,
  InsightsPreview,
  PreviewWindow,
} from "./product-previews";
import { Container, easeOut, Reveal, SectionHeading, Tone } from "./section";
import { scrollToY } from "./smooth-scroll";

const TABS = [
  {
    id: "inbox",
    icon: Inbox,
    label: "Inbox",
    title: "A real inbox for your domains",
    body: "Inbound mail arrives threaded, with attachments. Reply from any sender and see when it's read.",
    mood: "idle",
    preview: InboxPreview,
  },
  {
    id: "activity",
    icon: Activity,
    label: "Activity",
    title: "Every email, one timeline",
    body: "Search everything you sent across accounts. Open one to see each event, in order.",
    mood: "wow",
    preview: ActivityPreview,
  },
  {
    id: "insights",
    icon: LineChart,
    label: "Insights",
    title: "Answers, not logs",
    body: "Delivery, opens and bounces by domain and template, compared with last period.",
    mood: "thinking",
    preview: InsightsPreview,
  },
  {
    id: "alerts",
    icon: BellRing,
    label: "Alerts",
    title: "Hear about trouble first",
    body: "Rules on bounce rate, silent connections and domains. Incidents open and close themselves.",
    mood: "detective",
    preview: AlertsPreview,
  },
  {
    id: "ai",
    icon: Sparkles,
    label: "AI assist",
    title: "Help when you want it",
    body: "Triage incoming mail, draft replies, explain a spike. Admins can switch it off.",
    mood: "happy",
    preview: AiPreview,
  },
] as const satisfies readonly {
  id: string;
  icon: typeof Inbox;
  label: string;
  title: string;
  body: string;
  mood: WiziMood;
  preview: () => React.JSX.Element;
}[];

/** Scroll distance per view, in viewport heights (phones need less to feel responsive). */
const VH_PER_VIEW = { wide: 0.9, narrow: 0.55 };

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getWide = () => window.matchMedia("(min-width: 1024px)").matches;

export function Showcase() {
  const [active, setActive] = useState(0);
  const wide = useSyncExternalStore(subscribeWide, getWide, () => true);
  const perView = wide ? VH_PER_VIEW.wide : VH_PER_VIEW.narrow;
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const stripRef = useRef<HTMLDivElement>(null);
  const tab = TABS[active];

  // Phones show the tabs as a horizontal strip: keep the active one centred in it.
  useEffect(() => {
    const strip = stripRef.current;
    const btn = document.getElementById(`showcase-tab-${TABS[active].id}`);
    if (!strip || !btn || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: btn.offsetLeft - (strip.clientWidth - btn.offsetWidth) / 2 });
  }, [active]);
  const Preview = tab.preview;

  // State changes only at view boundaries, not per scroll frame.
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.min(TABS.length - 1, Math.floor(p * TABS.length));
    setActive((cur) => (cur === next ? cur : next));
  });

  const scrollTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    scrollToY(top + span * ((i + 0.5) / TABS.length));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (active + step + TABS.length) % TABS.length;
    scrollTo(next);
    document.getElementById(`showcase-tab-${TABS[next].id}`)?.focus();
  };

  return (
    <Tone
      tone="dark"
      as="section"
      id="product"
      className="relative scroll-mt-24 rounded-t-[2.5rem] pt-24 sm:rounded-t-[3.5rem] sm:pt-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-t-[inherit] bg-[radial-gradient(50%_25%_at_80%_5%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_70%),radial-gradient(40%_20%_at_10%_90%,color-mix(in_oklab,var(--glow)_10%,transparent),transparent_70%)]"
      />
      <Container className="relative">
        <Reveal>
          <SectionHeading
            eyebrow="The product"
            title={
              <>
                One desk for everything
                <br className="hidden sm:block" /> Resend leaves raw.
              </>
            }
            description="Five views, one login, every connected account. Keep scrolling to walk through them."
          />
        </Reveal>
      </Container>

      {/* Tall track; the stage inside pins while scrolling picks the view. */}
      <div
        ref={trackRef}
        className="relative"
        style={{ height: `${100 + TABS.length * perView * 100}dvh` }}
      >
        <div className="sticky top-0 flex h-[100dvh] items-center">
          <Container className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)] lg:gap-12">
            <div className="relative flex min-w-0 gap-2 lg:block">
              <div
                aria-hidden
                className="absolute top-2 bottom-2 left-0 hidden w-0.5 overflow-hidden rounded-full bg-line lg:block"
              >
                <m.div className="h-full w-full origin-top bg-accent" style={{ scaleY: scrollYProgress }} />
              </div>
              <div
                ref={stripRef}
                role="tablist"
                aria-label="Product views"
                aria-orientation="vertical"
                className="-mx-5 flex min-w-0 flex-1 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:px-0 lg:gap-1 lg:overflow-visible lg:pb-0 lg:pl-5"
                onKeyDown={onKeyDown}
              >
                {TABS.map((t, i) => {
                  const selected = i === active;
                  return (
                    <button
                      key={t.id}
                      id={`showcase-tab-${t.id}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls="showcase-panel"
                      tabIndex={selected ? 0 : -1}
                      onClick={() => scrollTo(i)}
                      className={cn(
                        "relative shrink-0 rounded-2xl px-4 py-2.5 text-left transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-accent lg:px-5 lg:py-4",
                        selected ? "bg-surface" : "hover:bg-surface/50",
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <t.icon
                          className={cn("size-4 shrink-0", selected ? "text-accent" : "text-ink-muted")}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            "text-sm font-semibold whitespace-nowrap lg:text-base",
                            selected ? "text-ink" : "text-ink-secondary",
                          )}
                        >
                          <span className="lg:hidden">{t.label}</span>
                          <span className="hidden lg:inline">{t.title}</span>
                        </span>
                      </span>
                      <span
                        className={cn(
                          "hidden overflow-hidden transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:grid",
                          selected ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <span className="min-h-0 pt-2 pl-7 text-sm leading-6 text-ink-secondary">
                          {t.body}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative min-w-0">
              <div className="absolute -top-14 right-6 z-10 hidden sm:block" aria-hidden>
                <Wizi mood={tab.mood} size={92} />
              </div>
              <p className="mb-3 min-h-12 text-sm leading-6 text-ink-secondary lg:hidden">
                {tab.body}
              </p>
              <div id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${tab.id}`}>
                <PreviewWindow title={tab.label}>
                  <AnimatePresence mode="wait" initial={false}>
                    <m.div
                      key={tab.id}
                      className="h-full"
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3, ease: easeOut }}
                    >
                      <Preview />
                    </m.div>
                  </AnimatePresence>
                </PreviewWindow>
              </div>
            </div>
          </Container>
        </div>
      </div>
    </Tone>
  );
}
