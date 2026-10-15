import { Check, Eye, Inbox, Paperclip, Reply, Send, Truck } from "lucide-react";
import { useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useState } from "react";

import { Wizi, type WiziMood } from "@/components/mascot/wizi";
import { cn } from "@/lib/utils";
import { easeOut } from "./section";

/** The hero's "desk": notifications, scattered objects and product fragments (also used by auth). */

/**
 * Glossy sticker-like button: warm-white rim, domed blue face, gloss highlight, soft depth.
 * One element, so it works on a Link or a form button. The highlight sits behind the label
 * (`isolate` + `before:-z-10`) so it never washes over the text.
 */
export const glossyButtonClass =
  "group relative isolate inline-flex h-[3.25rem] items-center justify-center gap-2 overflow-hidden rounded-full border-[3px] border-[#fbf9f5] bg-[linear-gradient(180deg,#2ba7e4_0%,#0284c7_42%,#075985_100%)] px-7 text-base font-bold tracking-[-0.01em] text-white [text-shadow:0_1px_1px_rgb(7_60_95_/0.6)] shadow-[inset_0_2px_1px_rgb(255_255_255_/0.5),inset_0_-4px_8px_rgb(7_60_95_/0.55),0_0_0_1px_rgb(60_45_20_/0.08),0_16px_30px_-12px_rgb(3_105_161_/0.6),0_4px_10px_-4px_rgb(60_45_20_/0.25)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] before:pointer-events-none before:absolute before:inset-x-3 before:top-[2px] before:-z-10 before:h-[45%] before:rounded-full before:bg-gradient-to-b before:from-white/45 before:to-white/0 hover:-translate-y-0.5 hover:shadow-[inset_0_2px_1px_rgb(255_255_255_/0.5),inset_0_-4px_8px_rgb(7_60_95_/0.55),0_0_0_1px_rgb(60_45_20_/0.08),0_22px_36px_-12px_rgb(3_105_161_/0.65),0_6px_12px_-4px_rgb(60_45_20_/0.25)] focus-visible:ring-4 focus-visible:ring-accent/30 focus-visible:outline-none active:translate-y-px active:shadow-[inset_0_2px_1px_rgb(255_255_255_/0.35),inset_0_-2px_6px_rgb(7_60_95_/0.6),0_8px_16px_-8px_rgb(3_105_161_/0.6)] disabled:pointer-events-none disabled:opacity-60";

const NOTES = [
  { avatar: "maya", logo: "northwind", name: "Maya Okafor", company: "Northwind", line: "Opened your reply about Invoice 2291", icon: Eye },
  { avatar: "priya", logo: "bakehouse", name: "Priya Raman", company: "Bakehouse", line: "Replied with 2 attachments", icon: Reply },
  { avatar: "tomas", logo: "tinylab", name: "Tomás Aguirre", company: "Tiny Lab", line: "Your reset email was delivered", icon: Truck },
  { avatar: "lena", logo: "fieldnotes", name: "Lena Fischer", company: "Fieldnotes", line: "Clicked “Read the guide”", icon: Eye },
] as const;

const DEPTH = 3;

/** Stacked notifications; a new one slides to the front every few seconds. */
export function NotificationStack({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [head, setHead] = useState(DEPTH - 1);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setHead((h) => h + 1), 3200);
    return () => window.clearInterval(id);
  }, [reduce]);

  const ids = Array.from({ length: DEPTH }, (_, i) => head - i);
  return (
    <div
      className={cn("relative mx-auto h-[5.5rem] w-[min(21rem,calc(100vw-2.5rem))]", className)}
      aria-hidden
    >
      {ids.map((n) => {
        const depth = head - n;
        const note = NOTES[n % NOTES.length];
        return (
          <m.div
            key={n}
            className="absolute inset-x-0 bottom-0"
            style={{ zIndex: DEPTH - depth }}
            initial={{ opacity: 0, y: 18, scale: 1.04 }}
            animate={{
              opacity: depth === 0 ? 1 : 0.85 - depth * 0.2,
              y: -depth * 15,
              scale: 1 - depth * 0.05,
              rotate: depth === 0 ? -1.5 : depth % 2 ? 2 : -3,
            }}
            transition={{ duration: 0.7, ease: easeOut }}
          >
            <div className="flex items-center gap-3 rounded-2xl border border-line/80 bg-surface p-2.5 pr-3.5 text-left shadow-[0_12px_30px_-14px_rgb(60_45_20_/0.35)]">
              <m.span
                className="flex min-w-0 flex-1 items-center gap-3"
                animate={{ opacity: depth === 0 ? 1 : 0 }}
                transition={{ duration: 0.4 }}
              >
                <span className="relative size-10 shrink-0">
                  <img
                    src={`/marketing/hero/people/${note.avatar}.webp`}
                    alt=""
                    className="size-10 rounded-full object-cover"
                  />
                  <img
                    src={`/marketing/hero/people/logo-${note.logo}.webp`}
                    alt=""
                    className="absolute -right-1 -bottom-1 size-[1.125rem] rounded-[5px] object-cover ring-2 ring-surface"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold">
                    <span className="truncate">{note.name}</span>
                    <span className="hidden shrink-0 font-normal text-ink-faint min-[380px]:inline">
                      {note.company}
                    </span>
                    <note.icon className="size-3 shrink-0 text-ink-muted" />
                  </span>
                  <span className="block truncate text-xs text-ink-muted">{note.line}</span>
                </span>
                <span className="self-start text-[0.625rem] font-medium text-ink-faint">now</span>
              </m.span>
            </div>
          </m.div>
        );
      })}
    </div>
  );
}

/** Drift with scroll at a given depth; stays put when no scroll progress is passed. */
function useDrift(progress: MotionValue<number> | undefined, depth: number) {
  const still = useMotionValue(0);
  return useTransform(progress ?? still, [0, 1], [0, depth * -260]);
}

/** A desk object or product fragment scattered at the edges, flying in once and drifting on scroll. */
export function Piece({
  progress,
  depth = 0,
  className,
  rotate = 0,
  delay = 0,
  from = { x: 0, y: 30 },
  blend = false,
  children,
}: {
  progress?: MotionValue<number>;
  depth?: number;
  className: string;
  rotate?: number;
  delay?: number;
  from?: { x: number; y: number };
  /** Photographed objects sit on white; multiply drops the white into the page. */
  blend?: boolean;
  children: React.ReactNode;
}) {
  const y = useDrift(progress, depth);
  return (
    <m.div
      className={cn("pointer-events-none absolute", blend && "mix-blend-multiply", className)}
      style={progress ? { y } : undefined}
      aria-hidden
    >
      <m.div
        initial={{ opacity: 0, x: from.x, y: from.y, rotate: rotate * 1.6 }}
        animate={{ opacity: 1, x: 0, y: 0, rotate }}
        transition={{ duration: 1.2, delay, ease: easeOut }}
      >
        {children}
      </m.div>
    </m.div>
  );
}

/** A photographed desk object from /marketing/hero. */
export function DeskImage({ name }: { name: "envelope" | "letters" | "bell-sticker" | "at-sticker" | "postage-stamp" | "paperclip" }) {
  return <img src={`/marketing/hero/${name}.webp`} alt="" className="block h-auto w-full select-none" />;
}

const inboxRows = [
  { n: "Priya Raman", s: "Order photos for the launch", t: "09:52", clip: true, unread: true },
  { n: "Tomás Aguirre", s: "Can't reset my password", t: "09:31", unread: true },
  { n: "Maya Okafor", s: "Re: Invoice 2291 is ready", t: "Tue" },
];

/** Inbox fragment; with `wizi`, Wizi perches on its top edge with his legs over the card. */
export function InboxCard({ wizi }: { wizi?: WiziMood }) {
  return (
    <div className="relative">
      {wizi ? (
        <div className="pointer-events-auto absolute right-[2.5rem] bottom-[calc(100%-2.35rem)] z-10 w-[6.75rem] lg:bottom-[calc(100%-2.6rem)] lg:w-[7.5rem]">
          <Wizi
            mood={wizi}
            size={200}
            pose="sit"
            title="Wizi, the Wisemail envelope"
            greet
            interactive
            followPointer
            className="h-auto w-full"
          />
        </div>
      ) : null}
      <div className="rounded-[1.25rem] border border-line bg-surface p-1.5 shadow-lg">
        {inboxRows.map((r) => (
          <div key={r.n} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5">
            <Inbox className="size-3.5 shrink-0 text-ink-faint" />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-xs", r.unread ? "font-bold" : "font-medium")}>
                {r.n}
              </span>
              <span className="block truncate text-[0.6875rem] text-ink-muted">{r.s}</span>
            </span>
            {r.clip ? <Paperclip className="size-3 text-ink-faint" /> : null}
            <span className="text-[0.625rem] text-ink-faint tabular-nums">{r.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReceiptCard() {
  return (
    <div className="rounded-[1.25rem] border border-line bg-surface p-4 shadow-lg">
      <p className="truncate text-xs font-semibold">Re: Invoice 2291 is ready</p>
      <p className="truncate text-[0.6875rem] text-ink-muted">to maya@northwind.studio</p>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[0.625rem] font-semibold">
        <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-info-ink">
          <Send className="size-2.5" />
          Sent
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-success-ink">
          <Check className="size-2.5" />
          Delivered
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-engaged-soft px-2 py-0.5 text-engaged-ink">
          <Eye className="size-2.5" />
          Opened
        </span>
      </div>
    </div>
  );
}

export function OpenRateCard() {
  return (
    <div className="rounded-[1.25rem] border border-line bg-surface p-4 shadow-lg">
      <p className="text-[0.6875rem] font-medium text-ink-muted">Open rate, 14 days</p>
      <p className="mt-0.5 font-display text-2xl font-bold tracking-[-0.03em] tabular-nums">41.2%</p>
      <svg viewBox="0 0 200 48" className="mt-2 h-10 w-full">
        <path
          d="M0 40 L20 37 L40 39 L60 31 L80 33 L100 26 L120 28 L140 19 L160 22 L180 12 L200 8"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
