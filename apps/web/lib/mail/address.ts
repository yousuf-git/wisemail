/** Address helpers shared by ingest, threading and sending. Pure, no server imports. */

export type MailAddress = { address: string; name?: string };

const SIMPLE_EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export const normalizeAddress = (address: string) => address.trim().toLowerCase();

export function isValidEmail(address: string): boolean {
  return address.length <= 254 && SIMPLE_EMAIL.test(address.trim());
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1
    ? ""
    : address
        .slice(at + 1)
        .trim()
        .toLowerCase();
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

export function parseAddressList(inputs: readonly string[] | null | undefined): MailAddress[] {
  const out: MailAddress[] = [];
  for (const input of inputs ?? []) {
    const parsed = parseAddress(input);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** `"Jane" <jane@x.com>` for the Resend `from` field; quotes and control characters stripped. */
export function formatAddress({
  address,
  name,
}: {
  address: string;
  name?: string | null;
}): string {
  const clean = (name ?? "").replace(/[\r\n"<>\\]/g, "").trim();
  return clean ? `"${clean}" <${address}>` : address;
}

export function uniqueAddresses(lists: readonly (readonly MailAddress[])[]): string[] {
  return [...new Set(lists.flat().map((a) => normalizeAddress(a.address)))];
}
