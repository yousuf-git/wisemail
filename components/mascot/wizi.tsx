"use client";

import { useAnimation, useReducedMotion } from "motion/react";

type AnimationControls = ReturnType<typeof useAnimation>;
import * as m from "motion/react-m";
import { useEffect, useRef, useState } from "react";

/** A mood without arms or eyes leaves its controls unbound, and start() then throws. */
function play(controls: AnimationControls, definition: Parameters<AnimationControls["start"]>[0]) {
  try {
    void controls.start(definition);
  } catch {
    // nothing mounted to animate
  }
}

import { cn } from "@/lib/utils";
import type { WiziMood } from "./moods";

export { wiziMoods, type WiziMood } from "./moods";

export type WiziProps = {
  mood?: WiziMood;
  /** Rendered width and height in px. FED sizes: 160 empty/onboarding, 64 greeting, 24 toasts. */
  size?: number;
  className?: string;
  /** Accessible name. Without it the mascot is decorative and hidden from assistive tech. */
  title?: string;
  /** Wave once on mount, at most once per browser session. */
  greet?: boolean;
  /** Wave and blush on hover or tap. Default true. */
  interactive?: boolean;
};

const fill = (token: string) => ({ fill: `var(--${token})` });
const stroke = (token: string) => ({ stroke: `var(--${token})` });
const around = (x: number, y: number) =>
  ({ transformBox: "view-box", transformOrigin: `${x}px ${y}px` }) as const;

const BLINKING: WiziMood[] = ["idle", "worried", "detective", "thinking"];
const GREETED_KEY = "wisemail-wizi-greeted";
let greetedThisPage = false;

function useVisible(ref: React.RefObject<Element | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

function Eyes({ mood }: { mood: WiziMood }) {
  const L = 80;
  const R = 120;
  const y = 128;
  const r = 6;
  const eye = { ...stroke("eye"), fill: "none" };
  if (mood === "happy") {
    return (
      <g strokeWidth="3.2" strokeLinecap="round" style={eye}>
        <path d={`M${L - r} ${y + 2} Q${L} ${y - r - 2} ${L + r} ${y + 2}`} />
        <path d={`M${R - r} ${y + 2} Q${R} ${y - r - 2} ${R + r} ${y + 2}`} />
      </g>
    );
  }
  if (mood === "sleep") {
    return (
      <g strokeWidth="3" strokeLinecap="round" style={eye}>
        <path d={`M${L - r} ${y} Q${L} ${y + r} ${L + r} ${y}`} />
        <path d={`M${R - r} ${y} Q${R} ${y + r} ${R + r} ${y}`} />
      </g>
    );
  }
  const big = mood === "wow" ? 1.2 : 1;
  const dy = mood === "thinking" ? -3 : 0;
  const dx = mood === "thinking" ? 2 : 0;
  return (
    <>
      {mood === "worried" && (
        <g strokeWidth="2.6" strokeLinecap="round" style={eye}>
          <path d="M72 117 L86 121" />
          <path d="M128 117 L114 121" />
        </g>
      )}
      {[L, R].map((x) => (
        <g key={x}>
          <circle cx={x + dx} cy={y + dy} r={r * big} style={fill("eye")} />
          <circle cx={x + dx + r * 0.35} cy={y + dy - r * 0.4} r={r * 0.32} fill="#fff" />
        </g>
      ))}
    </>
  );
}

function Mouth({ mood }: { mood: WiziMood }) {
  const line = { ...stroke("eye"), fill: "none" };
  if (mood === "wow") return <ellipse cx="100" cy="140" rx="4" ry="5" style={fill("eye")} />;
  const d =
    mood === "worried"
      ? "M93 141 Q100 135 107 141"
      : mood === "sleep"
        ? "M95 139 H105"
        : mood === "thinking"
          ? "M94 139 Q100 141 106 138"
          : "M93 136 Q100 143 107 136";
  return <path d={d} strokeWidth="3" strokeLinecap="round" style={line} />;
}

function RightArm({ mood }: { mood: WiziMood }) {
  const limb = { ...stroke("wizi-limb"), fill: "none" };
  const hand = { ...fill("paper"), ...stroke("wizi-limb") };
  if (mood === "thinking") {
    return (
      <>
        <path d="M158 112 Q150 136 124 146" strokeWidth="5" strokeLinecap="round" style={limb} />
        <circle cx="121" cy="147" r="7" strokeWidth="3" style={hand} />
      </>
    );
  }
  if (mood === "detective") {
    return (
      <>
        <path d="M158 112 Q172 116 176 128" strokeWidth="5" strokeLinecap="round" style={limb} />
        <path d="M178 132 L186 150" strokeWidth="6" strokeLinecap="round" style={limb} />
        <circle
          cx="170"
          cy="116"
          r="16"
          strokeWidth="4"
          style={{ ...fill("accent-soft"), ...stroke("wizi-limb") }}
        />
        <path
          d="M162 110 Q166 105 172 106"
          stroke="#fff"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity=".8"
        />
      </>
    );
  }
  return (
    <>
      <path d="M158 112 Q174 120 178 134" strokeWidth="5" strokeLinecap="round" style={limb} />
      <circle cx="179" cy="138" r="7" strokeWidth="3" style={hand} />
    </>
  );
}

export function Wizi({
  mood = "idle",
  size = 64,
  className,
  title,
  greet = false,
  interactive = true,
}: WiziProps) {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<SVGSVGElement>(null);
  const visible = useVisible(ref);
  const live = visible && !reduced;
  const arm = useAnimation();
  const eyes = useAnimation();
  const [blush, setBlush] = useState(false);
  const open = mood === "wow";

  // Wave once per session when asked to greet.
  useEffect(() => {
    if (!greet || reduced || greetedThisPage) return;
    try {
      if (sessionStorage.getItem(GREETED_KEY)) return;
      sessionStorage.setItem(GREETED_KEY, "1");
    } catch {
      // storage blocked: wave once per page load instead
    }
    greetedThisPage = true;
    const t = setTimeout(() => play(arm, waveKeyframes), 350);
    return () => clearTimeout(t);
  }, [greet, reduced, arm]);

  // Idle blink every 4-7 seconds while on screen.
  useEffect(() => {
    if (!live || !BLINKING.includes(mood)) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          play(eyes, { scaleY: [1, 0.1, 1], transition: { duration: 0.2 } });
          schedule();
        },
        4000 + Math.random() * 3000,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [live, mood, eyes]);

  const wave = () => {
    if (!interactive || reduced) return;
    setBlush(true);
    play(arm, waveKeyframes);
  };

  const loop = (keyframes: Record<string, number[]>, duration: number, delay = 0) =>
    live
      ? {
          ...keyframes,
          transition: { duration, delay, repeat: Infinity, ease: "easeInOut" as const },
        }
      : undefined;

  const decorative = !title;

  return (
    <svg
      ref={ref}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={cn("wizi block shrink-0 overflow-visible", className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      data-mood={mood}
      onPointerEnter={wave}
      onPointerLeave={() => setBlush(false)}
      onClick={wave}
    >
      {!decorative && <title>{title}</title>}
      <ellipse cx="100" cy="186" rx="52" ry="7" style={fill("ground")} />
      <g strokeWidth="5" strokeLinecap="round" style={stroke("wizi-limb")}>
        <path d="M80 150 V172" />
        <path d="M120 150 V172" />
      </g>
      <g style={fill("accent")}>
        <rect x="68" y="170" width="22" height="10" rx="5" />
        <rect x="110" y="170" width="22" height="10" rx="5" />
      </g>
      <m.g
        animate={live ? { y: [0, 1.5, 0] } : { y: 0 }}
        transition={{ duration: 4, repeat: live ? Infinity : 0, ease: "easeInOut" }}
      >
        {open && (
          <>
            <path
              d="M42 74 L100 22 L158 74 Z"
              strokeWidth="2.5"
              strokeLinejoin="round"
              style={{ ...fill("paper-2"), ...stroke("paper-line") }}
            />
            <rect
              x="58"
              y="40"
              width="84"
              height="56"
              rx="6"
              strokeWidth="2"
              style={{ ...fill("paper"), ...stroke("paper-line") }}
            />
            <path
              d="M70 54 h60 M70 64 h44 M70 74 h52"
              strokeWidth="3"
              strokeLinecap="round"
              style={stroke("paper-fold")}
            />
          </>
        )}
        <rect
          x="40"
          y="64"
          width="120"
          height="90"
          rx="18"
          strokeWidth="2.5"
          style={{ ...fill("paper"), ...stroke("paper-line") }}
        />
        <path
          d="M46 146 L86 114 M154 146 L114 114"
          strokeWidth="2"
          strokeLinecap="round"
          style={stroke("paper-fold")}
        />
        {!open && (
          <>
            <path
              d="M42 76 Q42 64 54 64 H146 Q158 64 158 76 L104 110 Q100 113 96 110 Z"
              strokeWidth="2.5"
              strokeLinejoin="round"
              style={{ ...fill("paper-2"), ...stroke("paper-line") }}
            />
            <g transform={mood === "worried" ? "rotate(-8 100 104)" : undefined}>
              <circle cx="100" cy="104" r="11" style={fill("accent")} />
              <path
                d="M94 104 L99 109 L107 99"
                stroke="#fff"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </>
        )}
        <m.g style={around(44, 108)} animate={arm}>
          <path
            d="M42 112 Q24 104 22 84"
            strokeWidth="5"
            strokeLinecap="round"
            style={{ ...stroke("wizi-limb"), fill: "none" }}
          />
          <circle
            cx="22"
            cy="80"
            r="7"
            strokeWidth="3"
            style={{ ...fill("paper"), ...stroke("wizi-limb") }}
          />
        </m.g>
        <RightArm mood={mood} />
        <m.g animate={eyes}>
          <Eyes mood={mood} />
        </m.g>
        {[66, 134].map((cx) => (
          <m.ellipse
            key={cx}
            cx={cx}
            cy="138"
            rx="7"
            ry="4"
            style={fill("glow")}
            initial={{ opacity: 0.35 }}
            animate={{ opacity: blush ? 0.7 : 0.35 }}
            transition={{ duration: 0.15 }}
          />
        ))}
        <Mouth mood={mood} />
      </m.g>
      {mood === "sleep" && (
        <m.g animate={loop({ y: [0, -6, 0], opacity: [1, 0.6, 1] }, 3)}>
          <text
            x="160"
            y="46"
            fontWeight="800"
            fontSize="22"
            style={{
              ...fill("ink-muted"),
              fontFamily: "var(--font-jakarta), system-ui, sans-serif",
            }}
          >
            z
          </text>
          <text
            x="176"
            y="30"
            fontWeight="800"
            fontSize="15"
            style={{
              ...fill("ink-muted"),
              fontFamily: "var(--font-jakarta), system-ui, sans-serif",
            }}
          >
            z
          </text>
        </m.g>
      )}
      {mood === "happy" && (
        <path
          d="M20 70 h22 M14 86 h26 M22 102 h18"
          strokeWidth="4"
          strokeLinecap="round"
          opacity=".55"
          style={stroke("accent")}
        />
      )}
      {mood === "wow" && (
        <g style={fill("glow")}>
          <m.path
            d="M168 36 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"
            animate={loop({ scale: [1, 0.7, 1], rotate: [0, 20, 0] }, 1.6)}
          />
          <m.path
            d="M28 44 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"
            animate={loop({ scale: [1, 0.7, 1], rotate: [0, 20, 0] }, 1.6, 0.4)}
          />
        </g>
      )}
      {mood === "thinking" && (
        <g style={fill("ink-muted")}>
          {[
            [160, 58, 4],
            [172, 44, 5.5],
            [188, 28, 7],
          ].map(([cx, cy, r], i) => (
            <m.circle
              key={cx}
              cx={cx}
              cy={cy}
              r={r}
              initial={{ opacity: 0.6 }}
              animate={loop({ opacity: [0.3, 1, 0.3] }, 1.2, i * 0.2)}
            />
          ))}
        </g>
      )}
    </svg>
  );
}

const waveKeyframes = {
  rotate: [0, -16, 8, -8, 0],
  transition: { duration: 1.2, ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number] },
};
