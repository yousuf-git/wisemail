/** True when the HTML has no text and no image. */
export function isBodyBlank(html: string): boolean {
  if (/<img\b/i.test(html)) return false;
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim();
  return text.length === 0;
}

/** Custom HTML that TipTap would flatten: ask before moving from HTML back to Rich text. */
export function isLossyForRich(html: string): boolean {
  return /<(table|style|div|span|center|font|section|head|body|html|form|iframe|video)\b|\sstyle\s*=/i.test(
    html,
  );
}
