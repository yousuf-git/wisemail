"use client";

import { ThemeToggle } from "@/components/theme/theme-toggle";

/** Theme toggle shown inside the dock sheet, where the top bar has no room for it. */
export function MobileTheme() {
  return <ThemeToggle className="w-full justify-between md:hidden" />;
}
