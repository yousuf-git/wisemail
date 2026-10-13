import { describe, expect, it } from "vitest";

import { scrubEvent, scrubString, scrubValue } from "./scrub";

describe("sentry scrubbing (web re-export)", () => {
  it("re-exports shared scrubbers", () => {
    expect(scrubString("Bearer abc.def")).toContain("[token]");
    expect(scrubValue({ password: "x" })).toEqual({ password: "[redacted]" });
    const event = scrubEvent({
      request: { url: "https://x.test/a?t=1", headers: { a: "b" }, data: { html: "h" } },
      user: { id: "u1", email: "a@b.co" },
    })!;
    expect(event.request).toEqual({ url: "https://x.test/a" });
    expect(event.user).toEqual({ id: "u1" });
  });
});
