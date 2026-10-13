import { describe, expect, it } from "vitest";

import { isBodyBlank, isLossyForRich, validateCompose } from "../compose-validation";

const ok = {
  senderId: "s1",
  senderActive: true,
  to: ["a@x.com"],
  cc: [],
  bcc: [],
  subject: "Hi",
  bodyHtml: "<p>Hello</p>",
  scheduledAt: null,
  uploading: false,
};

describe("validateCompose", () => {
  it("passes a complete email", () => {
    expect(validateCompose(ok)).toEqual({});
  });

  it("names each problem", () => {
    const errors = validateCompose({
      ...ok,
      senderId: null,
      to: [],
      subject: " ",
      bodyHtml: "<p></p>",
      uploading: true,
    });
    expect(Object.keys(errors).sort()).toEqual([
      "attachments",
      "html",
      "senderId",
      "subject",
      "to",
    ]);
  });

  it("flags invalid addresses, inactive senders and past times", () => {
    expect(validateCompose({ ...ok, to: ["nope"] }).to).toMatch(/highlighted/);
    expect(validateCompose({ ...ok, senderActive: false }).senderId).toMatch(/can't send/);
    expect(validateCompose({ ...ok, scheduledAt: new Date(1000), now: 5000 }).scheduledAt).toMatch(
      /future/,
    );
  });

  it("limits recipients to 50 across to, cc and bcc", () => {
    const many = Array.from({ length: 51 }, (_, i) => `u${i}@x.com`);
    expect(validateCompose({ ...ok, to: many }).to).toMatch(/at most 50/);
  });
});

describe("body helpers", () => {
  it("treats tags and nbsp as blank but keeps images", () => {
    expect(isBodyBlank("<p>&nbsp;</p>")).toBe(true);
    expect(isBodyBlank("<style>p{}</style>")).toBe(true);
    expect(isBodyBlank("<p><img src='https://x.com/a.png'></p>")).toBe(false);
  });
  it("spots HTML that rich text would flatten", () => {
    expect(isLossyForRich("<p>Hi <strong>there</strong></p>")).toBe(false);
    expect(isLossyForRich("<table><tr><td>x</td></tr></table>")).toBe(true);
    expect(isLossyForRich('<p style="color:red">x</p>')).toBe(true);
  });
});
