/** Address helpers. Pure, no server imports. */

export type MailAddress = { address: string; name?: string };

const SIMPLE_EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export const normalizeAddress = (address: string) => address.trim().toLowerCase();

export function isValidEmail(address: string): boolean {
  return address.length <= 254 && SIMPLE_EMAIL.test(address.trim());
}

/** Parses `Jane Doe <jane@x.com>`, `"Doe, Jane" <jane@x.com>` or a bare address. */
export function parseAddress(input: string): MailAddress | null {
  const value = input.trim();
  if (!value) return null;
  const angle = /^(.*?)<([^<>]+)>\s*$/.exec(value);
  if (angle) {
    const address = normalizeAddress(angle[2]!);
    const name = angle[1]!
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .trim();
    if (!isValidEmail(address)) return null;
    return name ? { address, name } : { address };
  }
  const address = normalizeAddress(value);
  return isValidEmail(address) ? { address } : null;
}
