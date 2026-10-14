import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type AtmosphereVariant = "hero" | "auth";

/**
 * Live atmosphere for marketing hero + auth shells.
 * CSS transforms only (no Motion, no SVG blur filters) so Lenis scroll stays smooth;
 * animation pauses when the layer is off-screen.
 */
export function AtmosphereWaves({
  variant = "hero",
  className,
}: {
  variant?: AtmosphereVariant;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  const auth = variant === "auth";

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setActive(!!entry?.isIntersecting),
      { rootMargin: "40px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-active={active ? "true" : "false"}
      className={cn(
        "atmosphere-waves pointer-events-none absolute inset-0 overflow-hidden bg-canvas",
        "isolate [contain:paint] [transform:translateZ(0)]",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0",
          auth
            ? "bg-[radial-gradient(90%_70%_at_88%_28%,color-mix(in_oklab,var(--glow)_22%,transparent),transparent_58%),radial-gradient(70%_55%_at_78%_62%,color-mix(in_oklab,var(--accent)_18%,transparent),transparent_55%)]"
            : "bg-[radial-gradient(80%_60%_at_72%_78%,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_58%),radial-gradient(55%_45%_at_88%_62%,color-mix(in_oklab,var(--glow)_16%,transparent),transparent_55%)]",
        )}
      />

      <svg
        className="absolute inset-0 size-full"
        viewBox={auth ? "0 0 900 1200" : "0 0 1440 900"}
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`aw-blue-${variant}`} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="28%" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="72%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`aw-amber-${variant}`} x1="100%" y1="40%" x2="0%" y2="60%">
            <stop offset="0%" stopColor="var(--glow)" stopOpacity="0" />
            <stop offset="30%" stopColor="var(--glow)" stopOpacity="0.5" />
            <stop offset="70%" stopColor="var(--glow)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Soft blooms — opacity only, no feGaussianBlur (that was tanking scroll). */}
        <g className="atmosphere-drift atmosphere-drift--a">
          <ellipse
            cx={auth ? 720 : 1080}
            cy={auth ? 280 : 620}
            rx={auth ? 260 : 360}
            ry={auth ? 210 : 190}
            fill="var(--glow)"
            opacity={0.16}
          />
        </g>
        <g className="atmosphere-drift atmosphere-drift--b">
          <ellipse
            cx={auth ? 680 : 420}
            cy={auth ? 620 : 720}
            rx={auth ? 300 : 420}
            ry={auth ? 230 : 200}
            fill="var(--accent)"
            opacity={0.14}
          />
        </g>

        <g className="atmosphere-drift atmosphere-drift--blue">
          <Ribbon
            d={auth ? AUTH_BLUE : HERO_BLUE}
            strands={auth ? 9 : 10}
            stroke={`url(#aw-blue-${variant})`}
            spread={auth ? 2.4 : 2.2}
          />
        </g>

        <g className="atmosphere-drift atmosphere-drift--amber">
          <Ribbon
            d={auth ? AUTH_AMBER : HERO_AMBER}
            strands={auth ? 8 : 9}
            stroke={`url(#aw-amber-${variant})`}
            spread={auth ? 2.2 : 2.0}
          />
        </g>

        <g className="atmosphere-drift atmosphere-drift--orbs">
          {(auth ? AUTH_ORBS : HERO_ORBS).map((orb) => (
            <circle
              key={orb.key}
              cx={orb.cx}
              cy={orb.cy}
              r={orb.r}
              fill={orb.fill}
              opacity={orb.opacity}
            />
          ))}
        </g>
      </svg>

      {/* Grain without mix-blend (blend modes force extra compositing while scrolling). */}
      <div className="atmosphere-grain absolute inset-0 opacity-[0.28] dark:opacity-[0.14]" />
    </div>
  );
}

function Ribbon({
  d,
  strands,
  stroke,
  spread,
}: {
  d: string;
  strands: number;
  stroke: string;
  spread: number;
}) {
  const mid = (strands - 1) / 2;
  return (
    <g stroke={stroke} fill="none" strokeLinecap="round">
      {Array.from({ length: strands }, (_, i) => {
        const t = Math.abs(i - mid) / Math.max(mid, 1);
        return (
          <path
            key={i}
            d={d}
            transform={`translate(0 ${(i - mid) * spread})`}
            strokeWidth={2.2 - t * 1.15}
            opacity={0.5 - t * 0.34}
          />
        );
      })}
    </g>
  );
}

const HERO_BLUE =
  "M -80 780 C 220 640, 380 820, 620 700 C 860 580, 1040 760, 1280 640 C 1380 590, 1480 620, 1560 560";
const HERO_AMBER =
  "M 1580 520 C 1320 640, 1180 480, 960 600 C 740 720, 560 540, 340 680 C 180 780, 40 720, -60 800";
const AUTH_BLUE =
  "M 980 180 C 820 320, 900 480, 720 560 C 540 640, 620 820, 480 940 C 380 1020, 420 1120, 300 1220";
const AUTH_AMBER =
  "M 1020 80 C 880 200, 960 340, 780 420 C 600 500, 700 680, 560 780 C 440 860, 520 980, 400 1100";

const HERO_ORBS = [
  { key: "h1", cx: 1180, cy: 640, r: 26, fill: "var(--paper)", opacity: 0.45 },
  { key: "h2", cx: 1260, cy: 700, r: 14, fill: "var(--accent)", opacity: 0.18 },
  { key: "h3", cx: 980, cy: 760, r: 10, fill: "var(--glow)", opacity: 0.22 },
];

const AUTH_ORBS = [
  { key: "a1", cx: 760, cy: 260, r: 42, fill: "var(--paper)", opacity: 0.5 },
  { key: "a2", cx: 820, cy: 420, r: 22, fill: "var(--accent)", opacity: 0.16 },
  { key: "a3", cx: 700, cy: 540, r: 16, fill: "var(--glow)", opacity: 0.2 },
  { key: "a4", cx: 780, cy: 680, r: 11, fill: "var(--paper)", opacity: 0.4 },
];
