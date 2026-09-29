import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import AlertFired, { alertFiredSubject } from "@/emails/alert-fired";
import DailyDigest, { digestSubject } from "@/emails/daily-digest";
import Invitation, { invitationSubject } from "@/emails/invitation";
import ResetPassword from "@/emails/reset-password";
import VerifyEmail from "@/emails/verify-email";

const url = "https://app.example.com/some/link?token=abc";

describe("system email templates", () => {
  it("verify, reset and invitation carry their link, in html and plain text", async () => {
    const cases = [
      createElement(VerifyEmail, { name: "Sam Rivera", url }),
      createElement(ResetPassword, { name: "Sam Rivera", url }),
      createElement(Invitation, {
        orgName: "Acme",
        inviterName: "Jo",
        roleLabel: "Developer",
        url,
        expiresInDays: 7,
      }),
    ];
    for (const element of cases) {
      const html = await render(element);
      const text = await render(element, { plainText: true });
      expect(html).toContain(`href="${url}"`);
      expect(text).toContain(url);
      expect(html).not.toMatch(/var\(--/); // no CSS variables: mail clients ignore them
    }
  });

  it("greets by first name and states the invitation's terms", async () => {
    const text = await render(createElement(VerifyEmail, { name: "Sam Rivera", url }), {
      plainText: true,
    });
    expect(text).toContain("Welcome, Sam");
    const props = {
      orgName: "Acme",
      inviterName: "Jo",
      roleLabel: "Developer",
      url,
      expiresInDays: 1,
    };
    expect(invitationSubject(props)).toBe("Jo invited you to Acme on Wisemail");
    expect(await render(createElement(Invitation, props), { plainText: true })).toContain(
      "expires in 1 day.",
    );
  });

  it("alert emails differ for open, resolved and info", async () => {
    const base = { orgName: "Acme", title: "Bounce rate is 6% on acme.com", summary: "Bad.", url };
    expect(alertFiredSubject(base)).toBe("Alert: Bounce rate is 6% on acme.com");
    expect(alertFiredSubject({ ...base, state: "resolved" })).toBe(
      "Resolved: Bounce rate is 6% on acme.com",
    );
    expect(alertFiredSubject({ ...base, state: "info" })).toBe("Bounce rate is 6% on acme.com");
    expect(await render(createElement(AlertFired, base))).toContain("Open the incident");
    expect(await render(createElement(AlertFired, { ...base, state: "resolved" }))).toContain(
      "See what happened",
    );
    expect(await render(createElement(AlertFired, { ...base, external: true }))).toContain(
      "added this address",
    );
  });

  it("the digest shows numbers, incidents and a quiet-day variant", async () => {
    const props = {
      orgName: "Acme",
      dateLabel: "Tuesday 29 September",
      stats: { sent: 1240, delivered: 1200, bounced: 14, complained: 1, opened: 600, received: 32 },
      incidents: [{ title: "Bounce rate is 6%", status: "open" as const, url }],
      unreadNotifications: 3,
      url,
    };
    expect(digestSubject(props)).toBe("Acme daily digest, Tuesday 29 September");
    const text = await render(createElement(DailyDigest, props), { plainText: true });
    expect(text).toContain("1,240");
    expect(text).toContain("Bounce rate is 6%");
    expect(text).toContain("3 unread notifications");
    const quiet = await render(
      createElement(DailyDigest, {
        ...props,
        stats: { sent: 0, delivered: 0, bounced: 0, complained: 0, opened: 0, received: 0 },
        incidents: [],
        unreadNotifications: 0,
      }),
      { plainText: true },
    );
    expect(quiet).toContain("A quiet day");
    expect(quiet).toContain("No alerts fired");
  });
});
