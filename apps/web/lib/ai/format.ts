/** Client-safe helpers shared by services and components. */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Model paragraphs to the small HTML the rich editor accepts: escaped `<p>` blocks. */
export function paragraphsToHtml(paragraphs: string[]): string {
  return paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export const paragraphsToText = (paragraphs: string[]) =>
  paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
