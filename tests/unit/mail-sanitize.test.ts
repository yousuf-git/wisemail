import { describe, expect, it } from "vitest";

import { parseRawMime, sanitizeFilename } from "@/lib/mail/parse";
import { buildRawMime } from "@/lib/mail/fake-mime";
import {
  htmlToText,
  makeSnippet,
  referencedContentIds,
  replaceContentIds,
  sanitizeEmailHtml,
} from "@/lib/mail/sanitize";

describe("sanitizeEmailHtml", () => {
  it("strips scripts, forms, embeds, base and event handlers", () => {
    const dirty = `
      <base href="https://evil.test/">
      <p onclick="steal()" onmouseover="x()">Hi</p>
      <script>alert(1)</script>
      <form action="https://evil.test"><input name="pw"><button>Go</button></form>
      <iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x">
      <meta http-equiv="refresh" content="0;url=https://evil.test"><link rel="stylesheet" href="https://evil.test/x.css">
      <svg onload="x()"><script>1</script></svg>
      <img src="x" onerror="steal()">`;
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).not.toMatch(
      /<script|<form|<input|<button|<iframe|<object|<embed|<base|<meta|<link|<svg/i,
    );
    expect(clean).not.toMatch(/onclick|onmouseover|onerror|onload/i);
    expect(clean).toContain("Hi");
  });

  it("neutralizes javascript: URLs but keeps normal links, opening in a new tab", () => {
    const clean = sanitizeEmailHtml(
      `<a href="javascript:alert(1)">bad</a><a href="https://ok.test/x">ok</a><a href="mailto:a@b.test">m</a>`,
    );
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toContain('href="https://ok.test/x"');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain("mailto:a@b.test");
  });

  it("keeps inline styles, cid: images and https images; upgrades http images", () => {
    const clean = sanitizeEmailHtml(
      `<p style="color:#123456;font-weight:bold">x</p>` +
        `<img src="cid:logo123"><img src="https://cdn.test/a.png"><img src="http://cdn.test/b.png">`,
    );
    expect(clean).toMatch(/style="[^"]*color:\s*(#123456|rgb\(18, 52, 86\))/i);
    expect(clean).toMatch(/font-weight:\s*bold/);
    expect(clean).toContain('src="cid:logo123"');
    expect(clean).toContain('src="https://cdn.test/a.png"');
    expect(clean).toContain('src="https://cdn.test/b.png"');
    expect(clean).not.toContain("http://cdn.test");
  });

  it("removes CSS imports", () => {
    const clean = sanitizeEmailHtml(
      `<style>@import url(https://evil.test/x.css); p{color:red}</style><p>x</p>`,
    );
    expect(clean).not.toMatch(/@import/i);
  });
});

describe("content ids", () => {
  it("finds referenced cids and replaces them, with a placeholder for missing images", () => {
    const html = `<img src="cid:A1"><img src="cid:missing">`;
    expect([...referencedContentIds(html)].sort()).toEqual(["a1", "missing"]);
    const out = replaceContentIds(html, (cid) => (cid === "a1" ? "https://signed.test/a1" : null));
    expect(out).toContain('src="https://signed.test/a1"');
    expect(out).toContain("data:image/svg+xml");
    expect(out).not.toContain("cid:");
  });
});

describe("text helpers", () => {
  it("derives text and snippets", () => {
    expect(htmlToText("<p>Hello&nbsp;<b>world</b></p><p>Bye</p>")).toBe("Hello world\nBye");
    expect(makeSnippet("a ".repeat(200)).length).toBeLessThanOrEqual(140);
    expect(makeSnippet("  short   text ")).toBe("short text");
  });
});

describe("parseRawMime", () => {
  it("parses headers, bodies and attachments; keeps exact filenames, strips path separators", async () => {
    const raw = buildRawMime({
      from: '"Jane Doe" <jane@customer.test>',
      to: ["support@acme.com"],
      cc: ["bob@customer.test"],
      subject: "Fwd: Über Rechnung ✓",
      messageId: "<m1@customer.test>",
      inReplyTo: "<m0@acme.com>",
      references: ["<m-1@acme.com>", "<m0@acme.com>"],
      text: "plain",
      html: '<p>html <img src="cid:logo"></p>',
      attachments: [
        {
          filename: "Rechnung März ✓.pdf",
          contentType: "application/pdf",
          content: Buffer.from("%PDF"),
        },
        {
          filename: "logo.png",
          contentType: "image/png",
          content: Buffer.from("png"),
          contentId: "logo",
        },
      ],
    });
    const parsed = await parseRawMime(raw);
    expect(parsed.messageId).toBe("<m1@customer.test>");
    expect(parsed.inReplyTo).toBe("<m0@acme.com>");
    expect(parsed.references).toEqual(["<m-1@acme.com>", "<m0@acme.com>"]);
    expect(parsed.subject).toBe("Fwd: Über Rechnung ✓");
    expect(parsed.from).toEqual({ address: "jane@customer.test", name: "Jane Doe" });
    expect(parsed.cc.map((a) => a.address)).toEqual(["bob@customer.test"]);
    expect(parsed.text).toContain("plain");
    expect(parsed.html).toContain("cid:logo");
    const pdf = parsed.attachments.find((a) => a.contentType === "application/pdf")!;
    expect(pdf.filename).toBe("Rechnung März ✓.pdf");
    expect(pdf.content.toString()).toBe("%PDF");
    const logo = parsed.attachments.find((a) => a.contentId)!;
    expect(logo.contentId).toBe("logo");
    expect(logo.disposition).toBe("inline");
  });

  it("only strips path separators and control characters from filenames", () => {
    expect(sanitizeFilename('..\\..//etc/pass"wd\u0000\n.txt')).toBe('....etcpass"wd.txt');
    expect(sanitizeFilename("  ")).toBe("attachment");
    expect(sanitizeFilename(null)).toBe("attachment");
  });
});
