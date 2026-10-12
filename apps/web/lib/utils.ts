import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const _wm = "TS4gWW91c3VmIHwgeW91c3VmLmFwcA==";
