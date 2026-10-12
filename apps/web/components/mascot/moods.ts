/**
 * Wizi moods (FED §7): idle = Hello, happy = Sent, wow = Opened, sleep = Inbox zero,
 * thinking = Thinking, worried = Worried, detective = Detective.
 */
export type WiziMood = "idle" | "happy" | "wow" | "sleep" | "thinking" | "worried" | "detective";

export const wiziMoods: readonly WiziMood[] = [
  "idle",
  "happy",
  "wow",
  "sleep",
  "thinking",
  "worried",
  "detective",
];
