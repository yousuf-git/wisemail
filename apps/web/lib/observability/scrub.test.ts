import { describe, expect, it } from "vitest";

import { scrubEvent, scrubString, scrubValue } from "./scrub";

describe("sentry scrubbing", () => {
  it("removes request headers, cookies, bodies and query strings", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: "https://app.wisemail.dev/acme/inbox?token=abc&x=a@b.co",
        headers: { authorization: "Bearer x", cookie: "session=1" },
        cookies: { session: "1" },
        data: { html: "<p>secret mail</p>" },
        query_string: "token=abc",
      },
      user: { id: "u1", email: "me@example.com", ip_address: "1.2.3.4", username: "me" },
      message: "failed for jane@example.com with re_abcdefgh12345",
      exception: { values: [{ value: "bad key sk_live_abcdef123456 for bob@x.io" }] },
      extra: { to: "a@b.co", html: "<p>hi</p>", orgId: "o1", nested: { apiKey: "k" } },
      tags: { orgId: "o1", who: "a@b.co" },
    })!;
    expect(event.request).toEqual({ url: "https://app.wisemail.dev/acme/inbox" });
    expect(event.user).toEqual({ id: "u1" });
    expect(event.message).toBe("failed for [email] with [key]");
    expect(event.exception?.values?.[0]?.value).toBe("bad key [key] for [email]");
    expect(event.extra).toEqual({
      to: "[redacted]",
      html: "[redacted]",
      orgId: "o1",
      nested: { apiKey: "[redacted]" },
    });
    expect(event.tags).toEqual({ orgId: "o1" });
  });

  it("scrubs strings and nested values", () => {
    expect(scrubString("Authorization: Bearer abc.def-123")).toBe("Authorization: Bearer [token]");
    expect(scrubValue({ list: [{ password: "p", ok: 1 }] })).toEqual({
      list: [{ password: "[redacted]", ok: 1 }],
    });
  });
});
