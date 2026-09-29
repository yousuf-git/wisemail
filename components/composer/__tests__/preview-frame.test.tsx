import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildPreviewDocument, PREVIEW_CSP, PREVIEW_SANDBOX, PreviewFrame } from "../preview-frame";

afterEach(cleanup);

describe("PreviewFrame", () => {
  it("is sandboxed with popups only: no scripts, no same-origin, no forms", () => {
    render(<PreviewFrame html="<p>Hello</p>" />);
    const frame = screen.getByTestId("composer-preview");
    expect(frame.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(PREVIEW_SANDBOX).toBe("allow-popups allow-popups-to-escape-sandbox");
    const flags = frame.getAttribute("sandbox")!.split(/\s+/);
    for (const banned of [
      "allow-scripts",
      "allow-same-origin",
      "allow-forms",
      "allow-top-navigation",
    ]) {
      expect(flags).not.toContain(banned);
    }
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("renders the draft in srcDoc under a strict CSP", () => {
    render(<PreviewFrame html={"<p>Hello</p><script>alert(1)</script>"} />);
    const doc = screen.getByTestId("composer-preview").getAttribute("srcdoc")!;
    expect(doc).toContain(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'">`,
    );
    expect(doc).toContain("<p>Hello</p>");
    // The CSP comes before any draft content.
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<p>Hello</p>"));
    expect(PREVIEW_CSP).not.toContain("script-src");
    expect(PREVIEW_CSP).toContain("default-src 'none'");
  });

  it("switches the document colors for the dark preview and the width for mobile", () => {
    expect(buildPreviewDocument("x", { dark: true })).toContain("background:#1a1917");
    expect(buildPreviewDocument("x")).toContain("background:#ffffff");
    render(<PreviewFrame html="x" width="mobile" />);
    expect(screen.getByTestId("composer-preview").className).toContain("max-w-[375px]");
  });
});
