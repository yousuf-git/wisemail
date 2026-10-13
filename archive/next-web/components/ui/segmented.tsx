"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Pick-one switch that looks like a tab list. Use it when the choice changes how the same area
 * behaves (e.g. the editor mode) rather than switching between separate panels: that is a radio
 * group, not tabs, so no aria-controls pointing at panels that don't exist.
 */
function Segmented({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented"
      orientation="horizontal"
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center rounded-control bg-canvas-sunken p-[3px] text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}

function SegmentedItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="segmented-item"
      className={cn(
        "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-control border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap text-ink-muted transition-all outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        "data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm dark:data-[state=checked]:border-input dark:data-[state=checked]:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

export { Segmented, SegmentedItem };
