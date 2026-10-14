import { cn } from "@/lib/utils";
import type { WiziMood } from "./moods";

export type { WiziMood } from "./moods";
export { wiziMoods } from "./moods";

const fill = (token: string) => ({ fill: `var(--${token})` });
const stroke = (token: string) => ({ stroke: `var(--${token})` });

function Eyes({ mood }: { mood: WiziMood }) {
  if (mood === "sleep") {
    return (
      <>
        <path d="M72 108 Q82 116 92 108" strokeWidth="4" fill="none" style={stroke("ink")} />
        <path d="M108 108 Q118 116 128 108" strokeWidth="4" fill="none" style={stroke("ink")} />
      </>
    );
  }
  if (mood === "wow") {
    return (
      <>
        <ellipse cx="82" cy="108" rx="9" ry="11" style={fill("ink")} />
        <ellipse cx="118" cy="108" rx="9" ry="11" style={fill("ink")} />
        <circle cx="85" cy="104" r="3" style={fill("paper")} />
        <circle cx="121" cy="104" r="3" style={fill("paper")} />
      </>
    );
  }
  if (mood === "worried") {
    return (
      <>
        <circle cx="82" cy="110" r="7" style={fill("ink")} />
        <circle cx="118" cy="110" r="7" style={fill("ink")} />
        <path d="M70 96 Q82 90 92 96" strokeWidth="3" fill="none" style={stroke("ink")} />
        <path d="M108 96 Q118 90 130 96" strokeWidth="3" fill="none" style={stroke("ink")} />
      </>
    );
  }
  if (mood === "detective") {
    return (
      <>
        <rect x="58" y="88" width="84" height="14" rx="3" style={fill("ink")} />
        <circle cx="82" cy="110" r="7" style={fill("ink")} />
        <circle cx="118" cy="110" r="7" style={fill("ink")} />
        <circle cx="84" cy="107" r="2.5" style={fill("paper")} />
        <circle cx="120" cy="107" r="2.5" style={fill("paper")} />
      </>
    );
  }
  return (
    <>
      <circle cx="82" cy="108" r="7" style={fill("ink")} />
      <circle cx="118" cy="108" r="7" style={fill("ink")} />
      <circle cx="84" cy="105" r="2.5" style={fill("paper")} />
      <circle cx="120" cy="105" r="2.5" style={fill("paper")} />
    </>
  );
}

function Mouth({ mood }: { mood: WiziMood }) {
  if (mood === "happy" || mood === "wow") {
    return <path d="M88 132 Q100 142 112 132" strokeWidth="3.5" fill="none" style={stroke("ink")} />;
  }
  if (mood === "worried") {
    return <path d="M88 138 Q100 130 112 138" strokeWidth="3.5" fill="none" style={stroke("ink")} />;
  }
  if (mood === "sleep") {
    return <path d="M94 134 H106" strokeWidth="3.5" fill="none" style={stroke("ink")} />;
  }
  if (mood === "thinking") {
    return <path d="M96 134 Q104 138 110 132" strokeWidth="3.5" fill="none" style={stroke("ink")} />;
  }
  return <path d="M90 134 Q100 138 110 134" strokeWidth="3.5" fill="none" style={stroke("ink")} />;
}

/**
 * Static Wizi (FED §7). SPA tours/auth use this without Motion; poses still follow `mood`.
 */
export function Wizi({
  mood = "idle",
  size = 64,
  className,
  title,
}: {
  mood?: WiziMood;
  size?: number;
  className?: string;
  title?: string;
}) {
  const open = mood === "wow";
  const decorative = !title;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={cn("wizi block shrink-0 overflow-visible", className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      data-mood={mood}
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
      <g>
        {open ? (
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
        ) : null}
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
        {!open ? (
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
        ) : null}
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
        {mood === "happy" || mood === "thinking" ? (
          <>
            <path
              d="M158 112 Q174 100 176 84"
              strokeWidth="5"
              strokeLinecap="round"
              style={{ ...stroke("wizi-limb"), fill: "none" }}
            />
            <circle
              cx="177"
              cy="80"
              r="7"
              strokeWidth="3"
              style={{ ...fill("paper"), ...stroke("wizi-limb") }}
            />
          </>
        ) : (
          <>
            <path
              d="M158 112 Q174 120 178 134"
              strokeWidth="5"
              strokeLinecap="round"
              style={{ ...stroke("wizi-limb"), fill: "none" }}
            />
            <circle
              cx="179"
              cy="138"
              r="7"
              strokeWidth="3"
              style={{ ...fill("paper"), ...stroke("wizi-limb") }}
            />
          </>
        )}
        <Eyes mood={mood} />
        <ellipse cx="66" cy="138" rx="7" ry="4" style={{ ...fill("glow"), opacity: 0.35 }} />
        <ellipse cx="134" cy="138" rx="7" ry="4" style={{ ...fill("glow"), opacity: 0.35 }} />
        <Mouth mood={mood} />
      </g>
      {mood === "sleep" ? (
        <text x="160" y="46" fontWeight="800" fontSize="22" style={fill("ink-muted")}>
          z
        </text>
      ) : null}
      {mood === "detective" ? (
        <path
          d="M140 70 L168 48"
          strokeWidth="4"
          strokeLinecap="round"
          style={stroke("ink")}
        />
      ) : null}
    </svg>
  );
}
