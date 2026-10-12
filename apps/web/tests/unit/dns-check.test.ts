import { describe, expect, it } from "vitest";

import {
  checkDomainDns,
  combine,
  dmarcHosts,
  fqdn,
  isBrokenVerdict,
  type ExpectedRecord,
} from "@/lib/dns/check";
import { classifyDnsError, DnsLookupError, type DnsResolver } from "@/lib/dns/resolver";

const NAME = "mail.example.com";

const RECORDS: ExpectedRecord[] = [
  {
    record: "SPF",
    type: "MX",
    name: "send.mail.example.com",
    value: "feedback-smtp.us-east-1.amazonses.com",
    priority: 10,
  },
  {
    record: "SPF",
    type: "TXT",
    name: "send.mail.example.com",
    value: "v=spf1 include:amazonses.com ~all",
  },
  {
    record: "DKIM",
    type: "TXT",
    name: "resend._domainkey.mail.example.com",
    value: "p=MIGfMA0GCSqGSIb3DQEB",
  },
  {
    record: "Receiving",
    type: "MX",
    name: "mail.example.com",
    value: "inbound-smtp.us-east-1.amazonaws.com",
    priority: 10,
  },
];

type Zone = {
  txt?: Record<string, string[]>;
  mx?: Record<string, { exchange: string; priority: number }[]>;
  cname?: Record<string, string[]>;
  /** Names whose lookup fails (timeout). */
  broken?: string[];
};

/** A resolver over a fixed zone; unknown names have no records. */
function resolverFor(zone: Zone): DnsResolver {
  const lookup = <T>(table: Record<string, T> | undefined, name: string, empty: T): T => {
    if (zone.broken?.includes(name)) throw new DnsLookupError("timeout", "timed out");
    return table?.[name.toLowerCase()] ?? empty;
  };
  return {
    resolveTxt: async (name) => lookup(zone.txt, name, []),
    resolveMx: async (name) => lookup(zone.mx, name, []),
    resolveCname: async (name) => lookup(zone.cname, name, []),
  };
}

const healthy: Zone = {
  txt: {
    "send.mail.example.com": ["v=spf1 include:amazonses.com ~all"],
    "resend._domainkey.mail.example.com": ["p=MIGfMA0GCSqGSIb3DQEB"],
    "_dmarc.mail.example.com": ["v=DMARC1; p=none; rua=mailto:d@example.com"],
  },
  mx: {
    "send.mail.example.com": [{ exchange: "feedback-smtp.us-east-1.amazonses.com", priority: 10 }],
    "mail.example.com": [{ exchange: "inbound-smtp.us-east-1.amazonaws.com", priority: 10 }],
  },
};

const check = (
  zone: Zone,
  over: Partial<{ receivingEnabled: boolean; records: ExpectedRecord[] }> = {},
) =>
  checkDomainDns(
    {
      name: NAME,
      records: over.records ?? RECORDS,
      receivingEnabled: over.receivingEnabled ?? true,
    },
    resolverFor(zone),
    new Date("2026-09-29T10:00:00Z"),
  );

describe("checkDomainDns", () => {
  it("passes everything for a healthy domain", async () => {
    const r = await check(healthy);
    expect(r).toMatchObject({ spf: "pass", dkim: "pass", dmarc: "pass", mx: "pass" });
    expect(r.checkedAt).toEqual(new Date("2026-09-29T10:00:00Z"));
    expect(r.details.every((d) => d.verdict === "pass")).toBe(true);
  });

  it("reports missing SPF and DKIM when nothing is published", async () => {
    const r = await check({});
    expect(r).toMatchObject({ spf: "missing", dkim: "missing", dmarc: "missing", mx: "missing" });
  });

  it("SPF: a different qualifier or order still passes, a missing include fails", async () => {
    const reordered = {
      ...healthy,
      txt: { ...healthy.txt, "send.mail.example.com": ["v=spf1 -all include:amazonses.com"] },
    };
    expect((await check(reordered)).spf).toBe("pass");
    const other = {
      ...healthy,
      txt: { ...healthy.txt, "send.mail.example.com": ["v=spf1 include:other.net ~all"] },
    };
    expect((await check(other)).spf).toBe("fail");
  });

  it("SPF: only the v=spf1 record counts, other TXT records at the name are ignored", async () => {
    const noisy = {
      ...healthy,
      txt: {
        ...healthy.txt,
        "send.mail.example.com": [
          "google-site-verification=abc",
          "v=spf1 include:amazonses.com ~all",
        ],
      },
    };
    expect((await check(noisy)).spf).toBe("pass");
    const onlyNoise = {
      ...healthy,
      txt: { ...healthy.txt, "send.mail.example.com": ["google-site-verification=abc"] },
    };
    expect((await check(onlyNoise)).spf).toBe("missing");
  });

  it("SPF: the MX half must point at Resend's feedback host", async () => {
    const wrongMx = {
      ...healthy,
      mx: {
        ...healthy.mx,
        "send.mail.example.com": [{ exchange: "mx.elsewhere.net", priority: 10 }],
      },
    };
    expect((await check(wrongMx)).spf).toBe("fail");
    const noMx = { ...healthy, mx: { "mail.example.com": healthy.mx!["mail.example.com"]! } };
    expect((await check(noMx)).spf).toBe("missing");
  });

  it("DKIM: matches on the public key, fails on a different key, tolerates split and quoted TXT", async () => {
    const changed = {
      ...healthy,
      txt: { ...healthy.txt, "resend._domainkey.mail.example.com": ["p=DIFFERENTKEY"] },
    };
    expect((await check(changed)).dkim).toBe("fail");
    const spaced = {
      ...healthy,
      txt: {
        ...healthy.txt,
        "resend._domainkey.mail.example.com": ['"v=DKIM1; k=rsa; p=MIGfMA0G" "CSqGSIb3DQEB"'],
      },
    };
    const recs: ExpectedRecord[] = [
      {
        record: "DKIM",
        type: "TXT",
        name: "resend._domainkey.mail.example.com",
        value: "p=MIGfMA0GCSqGSIb3DQEB",
      },
    ];
    expect((await check(spaced, { records: recs })).dkim).toBe("pass");
  });

  it("DKIM as CNAME compares the target", async () => {
    const recs: ExpectedRecord[] = [
      { record: "DKIM", type: "CNAME", name: "s1._domainkey", value: "s1.dkim.provider.net" },
    ];
    const ok = { cname: { "s1._domainkey.mail.example.com": ["s1.dkim.provider.net."] } };
    expect((await check(ok, { records: recs })).dkim).toBe("pass");
    const bad = { cname: { "s1._domainkey.mail.example.com": ["other.net"] } };
    expect((await check(bad, { records: recs })).dkim).toBe("fail");
    expect((await check({}, { records: recs })).dkim).toBe("missing");
  });

  it("DMARC: found on the domain, found on the parent, or missing", async () => {
    const parent = { ...healthy, txt: { ...healthy.txt } };
    delete parent.txt["_dmarc.mail.example.com"];
    parent.txt["_dmarc.example.com"] = ["v=DMARC1; p=reject"];
    const r = await check(parent);
    expect(r.dmarc).toBe("pass");
    expect(r.details.find((d) => d.group === "dmarc")?.message).toContain("policy reject");

    const none = { ...healthy, txt: { ...healthy.txt } };
    delete none.txt["_dmarc.mail.example.com"];
    expect((await check(none)).dmarc).toBe("missing");
    // A non-DMARC TXT at the name is not DMARC.
    none.txt["_dmarc.mail.example.com"] = ["something else"];
    expect((await check(none)).dmarc).toBe("missing");
  });

  it("MX only matters when receiving is on", async () => {
    const off = await check({ ...healthy, mx: {} }, { receivingEnabled: false });
    expect(off.mx).toBe("skipped");
    const wrong = {
      ...healthy,
      mx: { ...healthy.mx, "mail.example.com": [{ exchange: "mx.other.net", priority: 5 }] },
    };
    expect((await check(wrong)).mx).toBe("fail");
  });

  it("a failed lookup is unknown, never missing", async () => {
    const r = await check({
      ...healthy,
      broken: [
        "resend._domainkey.mail.example.com",
        "_dmarc.mail.example.com",
        "_dmarc.example.com",
      ],
    });
    expect(r.dkim).toBe("unknown");
    expect(r.dmarc).toBe("unknown");
    expect(r.spf).toBe("pass");
    expect(isBrokenVerdict(r.dkim)).toBe(false);
  });

  it("a definite failure beats an unknown one within a group", async () => {
    const zone = {
      ...healthy,
      txt: { ...healthy.txt, "send.mail.example.com": ["v=spf1 include:other.net"] },
      broken: [] as string[],
    };
    const wrongAndBroken: DnsResolver = {
      ...resolverFor(zone),
      resolveMx: async (name) => {
        if (name === "send.mail.example.com") throw new DnsLookupError("timeout", "x");
        return zone.mx![name] ?? [];
      },
    };
    const r = await checkDomainDns(
      { name: NAME, records: RECORDS, receivingEnabled: true },
      wrongAndBroken,
    );
    expect(r.spf).toBe("fail");
  });

  it("uses names relative to the domain and ignores record kinds it does not check", async () => {
    const recs: ExpectedRecord[] = [
      { record: "DKIM", type: "TXT", name: "resend._domainkey", value: "p=MIGfMA0GCSqGSIb3DQEB" },
      { record: "Tracking", type: "CNAME", name: "links", value: "track.resend.com" },
    ];
    const r = await check(healthy, { records: recs });
    expect(r.dkim).toBe("pass");
    expect(r.details.some((d) => d.name === "links.mail.example.com")).toBe(false);
  });
});

describe("helpers", () => {
  it("fqdn", () => {
    expect(fqdn("send", "example.com")).toBe("send.example.com");
    expect(fqdn("send.example.com", "example.com")).toBe("send.example.com");
    expect(fqdn("@", "Example.com")).toBe("example.com");
    expect(fqdn("example.com.", "example.com")).toBe("example.com");
  });

  it("dmarcHosts walks up to two labels", () => {
    expect(dmarcHosts("a.b.example.com")).toEqual([
      "_dmarc.a.b.example.com",
      "_dmarc.b.example.com",
      "_dmarc.example.com",
    ]);
    expect(dmarcHosts("example.com")).toEqual(["_dmarc.example.com"]);
  });

  it("combine", () => {
    expect(combine([])).toBe("skipped");
    expect(combine(["pass", "pass"])).toBe("pass");
    expect(combine(["pass", "missing"])).toBe("missing");
    expect(combine(["missing", "fail"])).toBe("fail");
    expect(combine(["pass", "unknown"])).toBe("unknown");
  });

  it("classifies resolver errors", () => {
    expect(classifyDnsError({ code: "ENOTFOUND" })).toBe("empty");
    expect(classifyDnsError({ code: "ENODATA" })).toBe("empty");
    const timeout = classifyDnsError({ code: "ETIMEOUT", message: "t" });
    expect(timeout).toBeInstanceOf(DnsLookupError);
    expect((timeout as DnsLookupError).reason).toBe("timeout");
    expect((classifyDnsError({ code: "ESERVFAIL" }) as DnsLookupError).reason).toBe("servfail");
    expect((classifyDnsError(new Error("boom")) as DnsLookupError).reason).toBe("error");
  });
});
