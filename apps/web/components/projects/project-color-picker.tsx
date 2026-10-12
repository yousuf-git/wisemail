"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { PROJECT_COLORS, PROJECT_COLOR_CLASS, type ProjectColor } from "@/lib/validation/project";

const LABEL: Record<ProjectColor, string> = {
  accent: "Sky",
  engaged: "Violet",
  success: "Green",
  warning: "Amber",
  coral: "Coral",
  danger: "Red",
};

/** Small round dot in a project's palette color. */
export function ProjectDot({ color, className }: { color: ProjectColor; className?: string }) {
  return (
    <i
      aria-hidden
      className={cn("block size-2.5 shrink-0 rounded-full", PROJECT_COLOR_CLASS[color], className)}
    />
  );
}

/** Radio group of palette tokens (never free-form hex). */
export function ProjectColorPicker({
  value,
  onChange,
  labelledBy,
}: {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
  labelledBy?: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {PROJECT_COLORS.map((color) => {
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={LABEL[color]}
            title={LABEL[color]}
            onClick={() => onChange(color)}
            className={cn(
              "grid size-8 place-items-center rounded-full text-accent-ink transition-transform duration-150 ease-soft outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              PROJECT_COLOR_CLASS[color],
              selected
                ? "scale-110 ring-2 ring-ink/70 ring-offset-2 ring-offset-surface"
                : "hover:scale-105",
            )}
          >
            {selected ? <Check aria-hidden className="size-4 text-white" strokeWidth={3} /> : null}
          </button>
        );
      })}
    </div>
  );
}
