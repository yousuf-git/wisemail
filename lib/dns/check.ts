import { DnsLookupError, type DnsResolver } from "./resolver";

/**
 * DNS check for one domain (PRD §5.7): SPF, DKIM, DMARC and MX against what Resend says the
 * domain should have. Pure apart from the injected resolver, so the whole matrix is testable.
 *
 * Verdicts: `pass` (present and matching), `fail` (present but different), `missing` (nothing
 * there), `unknown` (the lookup itself failed: never alerted on), `skipped` (not applicable,
 * e.g. receiving is off).
 */

export const DNS_VERDICTS = ["pass", "fail", "missing", "unknown", "skipped"] as const;
export type DnsVerdict = (typeof DNS_VERDICTS)[number];
export const DNS_GROUPS = ["spf", "dkim", "dmarc", "mx"] as const;
export type DnsGroup = (typeof DNS_GROUPS)[number];

export type ExpectedRecord = {
  /** Resend's label: `SPF`, `DKIM`, `Receiving`, `Tracking`, ... */
  record: string;
  type: string;
  name: string;
  value: string;
  priority?: number | null;
};

export type DnsCheckDetail = {
  group: DnsGroup;
  type: string;
  name: string;
  expected: string;
  found: string[];
  verdict: DnsVerdict;
  /** Human sentence for the detail view. */
  message: string;
};

export type DnsCheckResult = Record<DnsGroup, DnsVerdict> & {
  checkedAt: Date;
  details: DnsCheckDetail[];
};

export type DnsCheckInput = {
  name: string;
  records: ExpectedRecord[];
  receivingEnabled: boolean;
};

const clean = (host: string) => host.trim().toLowerCase().replace(/\.$/, "");
const squash = (value: string) => value.replace(/["\s]/g, "");

/** Fully qualified: Resend reports names relative to the domain for some records. */
export function fqdn(recordName: string, domain: string): string {
  const name = clean(recordName);
  const root = clean(domain);
  if (!name || name === "@") return root;
  return name === root || name.endsWith(`.${root}`) ? name : `${name}.${root}`;
}

const spfIncludes = (spf: string) =>
  spf
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.startsWith("include:") || t.startsWith("ip4:") || t.startsWith("ip6:"));

type Lookup = { found: string[]; verdict: DnsVerdict; error?: string };

/** SPF matches on its mechanisms (`include:` etc.), so a different qualifier or order still passes. */
function txtMatches(group: DnsGroup, expected: string, found: string): boolean {
  if (group === "spf" && /^v=spf1/i.test(expected)) {
    const wanted = spfIncludes(expected);
    if (!/^v=spf1/i.test(found)) return false;
    const have = new Set(spfIncludes(found));
    return wanted.every((w) => have.has(w));
  }
  if (group === "dkim") {
    const p = /p=([^;\s]+)/i.exec(squash(expected))?.[1];
    return p ? squash(found).includes(`p=${p}`) : squash(found) === squash(expected);
  }
  return squash(found).toLowerCase() === squash(expected).toLowerCase();
}

async function lookupRecord(
  resolver: DnsResolver,
  group: DnsGroup,
  rec: ExpectedRecord,
  host: string,
): Promise<Lookup & { message: string }> {
  try {
    const type = rec.type.toUpperCase();
    if (type === "MX") {
      const rows = await resolver.resolveMx(host);
      const found = rows.map((r) => `${r.priority} ${clean(r.exchange)}`);
      if (rows.length === 0)
        return { found, verdict: "missing", message: `No MX record at ${host}.` };
      const ok = rows.some((r) => clean(r.exchange) === clean(rec.value));
      return {
        found,
        verdict: ok ? "pass" : "fail",
        message: ok
          ? `MX at ${host} points to ${clean(rec.value)}.`
          : `MX at ${host} doesn't point to ${clean(rec.value)}.`,
      };
    }
    if (type === "CNAME") {
      const rows = await resolver.resolveCname(host);
      const found = rows.map(clean);
      if (rows.length === 0) return { found, verdict: "missing", message: `No CNAME at ${host}.` };
      const ok = found.includes(clean(rec.value));
      return {
        found,
        verdict: ok ? "pass" : "fail",
        message: ok ? `CNAME at ${host} matches.` : `CNAME at ${host} points somewhere else.`,
      };
    }
    // TXT
    const rows = await resolver.resolveTxt(host);
    const relevant = group === "spf" ? rows.filter((r) => /^v=spf1/i.test(r.trim())) : rows;
    if (relevant.length === 0) {
      return {
        found: rows,
        verdict: "missing",
        message: `No ${group.toUpperCase()} TXT record at ${host}.`,
      };
    }
    const ok = relevant.some((r) => txtMatches(group, rec.value, r));
    return {
      found: relevant,
      verdict: ok ? "pass" : "fail",
      message: ok
        ? `${group.toUpperCase()} at ${host} matches.`
        : `${group.toUpperCase()} at ${host} differs from what Resend expects.`,
    };
  } catch (error) {
    const reason = error instanceof DnsLookupError ? error.reason : "error";
    return {
      found: [],
      verdict: "unknown",
      error: reason,
      message: `Couldn't look up ${host} (${reason}). We'll try again.`,
    };
  }
}

/** Worst verdict wins, except `unknown`, which only shows when nothing definite was found. */
export function combine(verdicts: DnsVerdict[]): DnsVerdict {
  if (verdicts.length === 0) return "skipped";
  if (verdicts.every((v) => v === "pass")) return "pass";
  if (verdicts.includes("fail")) return "fail";
  if (verdicts.includes("missing")) return "missing";
  return verdicts.includes("unknown") ? "unknown" : "skipped";
}

const groupOf = (record: string): DnsGroup | null => {
  switch (record.toUpperCase()) {
    case "SPF":
      return "spf";
    case "DKIM":
      return "dkim";
    case "RECEIVING":
      return "mx";
    default:
      return null;
  }
};

/** `_dmarc.<name>`, then each parent down to the registrable-looking domain (two labels). */
export function dmarcHosts(domain: string): string[] {
  const labels = clean(domain).split(".");
  const hosts: string[] = [];
  for (let i = 0; i <= Math.max(0, labels.length - 2); i++) {
    hosts.push(`_dmarc.${labels.slice(i).join(".")}`);
  }
  return hosts;
}

async function checkDmarc(
  resolver: DnsResolver,
  domain: string,
): Promise<{ verdict: DnsVerdict; detail: DnsCheckDetail }> {
  const hosts = dmarcHosts(domain);
  let unknown = false;
  for (const host of hosts) {
    try {
      const rows = await resolver.resolveTxt(host);
      const dmarc = rows.find((r) => /^v=DMARC1\b/i.test(r.trim()));
      if (dmarc) {
        const policy = /;\s*p=([a-z]+)/i.exec(dmarc)?.[1]?.toLowerCase() ?? "none";
        return {
          verdict: "pass",
          detail: {
            group: "dmarc",
            type: "TXT",
            name: host,
            expected: "v=DMARC1; p=…",
            found: [dmarc],
            verdict: "pass",
            message:
              policy === "none"
                ? `DMARC found at ${host} (policy none: monitoring only).`
                : `DMARC found at ${host} (policy ${policy}).`,
          },
        };
      }
    } catch {
      unknown = true;
    }
  }
  const verdict: DnsVerdict = unknown ? "unknown" : "missing";
  return {
    verdict,
    detail: {
      group: "dmarc",
      type: "TXT",
      name: hosts[0] ?? `_dmarc.${domain}`,
      expected: "v=DMARC1; p=none; rua=mailto:you@example.com",
      found: [],
      verdict,
      message:
        verdict === "unknown"
          ? "Couldn't look up DMARC. We'll try again."
          : `No DMARC record found. Add a TXT record at ${hosts[0]} such as "v=DMARC1; p=none".`,
    },
  };
}

export async function checkDomainDns(
  input: DnsCheckInput,
  resolver: DnsResolver,
  now: Date = new Date(),
): Promise<DnsCheckResult> {
  const details: DnsCheckDetail[] = [];
  const byGroup: Record<DnsGroup, DnsVerdict[]> = { spf: [], dkim: [], dmarc: [], mx: [] };

  const lookups = await Promise.all(
    input.records.map(async (rec) => {
      const group = groupOf(rec.record);
      if (!group || (group === "mx" && !input.receivingEnabled)) return null;
      const host = fqdn(rec.name, input.name);
      return { rec, group, host, lookup: await lookupRecord(resolver, group, rec, host) };
    }),
  );
  for (const item of lookups) {
    if (!item) continue;
    const { rec, group, host, lookup } = item;
    byGroup[group].push(lookup.verdict);
    details.push({
      group,
      type: rec.type.toUpperCase(),
      name: host,
      expected: rec.priority != null ? `${rec.priority} ${rec.value}` : rec.value,
      found: lookup.found,
      verdict: lookup.verdict,
      message: lookup.message,
    });
  }

  const dmarc = await checkDmarc(resolver, input.name);
  byGroup.dmarc.push(dmarc.verdict);
  details.push(dmarc.detail);

  return {
    spf: combine(byGroup.spf),
    dkim: combine(byGroup.dkim),
    dmarc: combine(byGroup.dmarc),
    mx: input.receivingEnabled ? combine(byGroup.mx) : "skipped",
    checkedAt: now,
    details,
  };
}

/** Verdicts that mean the domain's DNS is broken (drift), as opposed to unknown or skipped. */
export const isBrokenVerdict = (v: string | null | undefined) => v === "fail" || v === "missing";
