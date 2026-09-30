import { describe, expect, it } from "vitest";

import { passwordStrength } from "@/lib/validation/password-strength";

describe("passwordStrength", () => {
  it("says nothing scary before typing and counts down the length", () => {
    expect(passwordStrength("")).toMatchObject({ score: 0, label: "" });
    expect(passwordStrength("abc")).toMatchObject({
      score: 1,
      label: "Too short",
      hint: "5 more to go.",
    });
  });
  it("flags common words and repeats even when long enough", () => {
    expect(passwordStrength("password123").label).toBe("Easy to guess");
    expect(passwordStrength("aaaaaaaaaa").label).toBe("Easy to guess");
  });
  it("rewards length and variety", () => {
    expect(passwordStrength("tulipfield").score).toBe(1);
    expect(passwordStrength("tulipfield-garden").score).toBeGreaterThanOrEqual(3);
    expect(passwordStrength("Tulip-Field-9-Garden!").score).toBe(4);
  });
});
