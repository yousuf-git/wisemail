import { describe, expect, it } from "vitest";

import {
  CHECKLIST_KEYS,
  describeChecklistItem,
  summarizeChecklist,
  type ChecklistKey,
} from "@/lib/dto/checklist";
import {
  affectedDomains,
  computeChecklist,
  toChecklistDTO,
  type ChecklistDomain,
  type ChecklistInput,
} from "@/lib/services/checklist";

const rec = (record: string, status = "verified") => ({ record, status });

/** A domain with every check green unless overridden. */
const domain = (name: string, over: Partial<ChecklistDomain> = {}): ChecklistDomain => ({
  id: name,
  name,
  status: "verified",
  openTracking: true,
  clickTracking: true,
  receivingEnabled: true,
  records: [rec("SPF"), rec("DKIM"), rec("Receiving")],
  ...over,
});

const input = (over: Partial<ChecklistInput> = {}): ChecklistInput => ({
  webhook: { registered: true, remote: "ok", lastEventAt: new Date() },
  domains: [domain("a.com")],
  ...over,
});

const statusOf = (result: ReturnType<typeof computeChecklist>, key: ChecklistKey) =>
  result.find((i) => i.key === key)?.status;

describe("computeChecklist", () => {
  it("all green: every item ok (DMARC omitted without DNS-check data)", () => {
    const result = computeChecklist(input());
    expect(result.map((i) => i.key)).toEqual([
      "webhook",
      "domain_verified",
      "dns_records",
      "open_tracking",
      "click_tracking",
      "receiving",
    ]);
    expect(result.every((i) => i.status === "ok")).toBe(true);
  });

  it("stays within the stored bound and in canonical order", () => {
    const result = computeChecklist(input({ domains: [domain("a.com", { dmarc: "present" })] }));
    expect(result.length).toBeLessThanOrEqual(10);
    const order = result.map((i) => CHECKLIST_KEYS.indexOf(i.key));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(statusOf(result, "dmarc")).toBe("ok");
  });

  describe("webhook", () => {
    it.each([
      ["not registered", { registered: false, remote: "unknown", lastEventAt: new Date() }, "fail"],
      ["gone in Resend", { registered: true, remote: "missing", lastEventAt: new Date() }, "fail"],
      ["registered, no event yet", { registered: true, remote: "ok", lastEventAt: null }, "warn"],
      [
        "registered, remote unknown, events flowing",
        { registered: true, remote: "unknown", lastEventAt: new Date() },
        "ok",
      ],
      ["healthy", { registered: true, remote: "ok", lastEventAt: new Date() }, "ok"],
    ] as const)("%s -> %s", (_label, webhook, expected) => {
      expect(statusOf(computeChecklist(input({ webhook })), "webhook")).toBe(expected);
    });
  });

  describe("domains", () => {
    it("no domains: only the verified-domain item fails, dependent items are omitted", () => {
      const result = computeChecklist(input({ domains: [] }));
      expect(result.map((i) => [i.key, i.status])).toEqual([
        ["webhook", "ok"],
        ["domain_verified", "fail"],
      ]);
    });

    it.each([
      ["all verified", ["verified", "verified"], "ok"],
      ["some verified", ["verified", "pending"], "warn"],
      ["none verified", ["pending", "failed"], "fail"],
    ] as const)("verified domains: %s -> %s", (_l, statuses, expected) => {
      const domains = statuses.map((status, i) => domain(`d${i}.com`, { status }));
      expect(statusOf(computeChecklist(input({ domains })), "domain_verified")).toBe(expected);
    });

    it("SPF/DKIM: all, some, none, and missing records count as not verified", () => {
      const good = domain("good.com");
      const noDkim = domain("nodkim.com", { records: [rec("SPF"), rec("Receiving")] });
      const pending = domain("pending.com", {
        records: [rec("SPF", "pending"), rec("DKIM", "pending")],
      });
      const dns = (domains: ChecklistDomain[]) =>
        statusOf(computeChecklist(input({ domains })), "dns_records");
      expect(dns([good])).toBe("ok");
      expect(dns([good, pending])).toBe("warn");
      expect(dns([pending])).toBe("fail");
      expect(dns([noDkim])).toBe("fail");
      expect(dns([domain("nothing.com", { records: [] })])).toBe("fail");
    });

    it("a single unverified SPF record spoils the domain", () => {
      const mixed = domain("m.com", { records: [rec("SPF"), rec("SPF", "pending"), rec("DKIM")] });
      expect(statusOf(computeChecklist(input({ domains: [mixed] })), "dns_records")).toBe("fail");
    });

    it.each([
      ["open_tracking", "openTracking"],
      ["click_tracking", "clickTracking"],
    ] as const)("%s: all on ok, some off warn, all off warn", (key, field) => {
      const on = domain("on.com");
      const off = domain("off.com", { [field]: false });
      const at = (domains: ChecklistDomain[]) =>
        statusOf(computeChecklist(input({ domains })), key);
      expect(at([on])).toBe("ok");
      expect(at([on, off])).toBe("warn");
      expect(at([off])).toBe("warn");
    });

    it("receiving needs both the capability and a verified MX record", () => {
      const at = (d: ChecklistDomain) =>
        statusOf(computeChecklist(input({ domains: [d] })), "receiving");
      expect(at(domain("a.com"))).toBe("ok");
      expect(at(domain("b.com", { receivingEnabled: false }))).toBe("warn");
      expect(
        at(domain("c.com", { records: [rec("SPF"), rec("DKIM"), rec("Receiving", "pending")] })),
      ).toBe("warn");
      expect(at(domain("d.com", { records: [rec("SPF"), rec("DKIM")] }))).toBe("warn");
    });

    it("DMARC appears only with data and judges just the checked domains", () => {
      const at = (domains: ChecklistDomain[]) =>
        statusOf(computeChecklist(input({ domains })), "dmarc");
      expect(at([domain("a.com"), domain("b.com")])).toBeUndefined();
      expect(at([domain("a.com", { dmarc: "present" }), domain("b.com")])).toBe("ok");
      expect(
        at([domain("a.com", { dmarc: "present" }), domain("b.com", { dmarc: "missing" })]),
      ).toBe("warn");
      expect(at([domain("a.com", { dmarc: "missing" })])).toBe("fail");
    });
  });

  it("the seeded mixed account produces a mix of ok and warn", () => {
    const result = computeChecklist({
      webhook: { registered: true, remote: "ok", lastEventAt: null },
      domains: [
        domain("one.com", { openTracking: false }),
        domain("two.com", { receivingEnabled: false, records: [rec("SPF"), rec("DKIM")] }),
        domain("three.com", {
          status: "pending",
          receivingEnabled: false,
          records: [rec("SPF", "pending"), rec("DKIM", "pending")],
        }),
      ],
    });
    const statuses = new Set(result.map((i) => i.status));
    expect(statuses.has("ok") && statuses.has("warn")).toBe(true);
    expect(statusOf(result, "click_tracking")).toBe("ok");
    expect(statusOf(result, "open_tracking")).toBe("warn");
  });
});

describe("affectedDomains and DTOs", () => {
  const domains = [
    domain("a.com", { openTracking: false }),
    domain("b.com", { status: "pending", records: [] }),
  ];

  it("names the domains behind each item", () => {
    expect(affectedDomains("open_tracking", domains)).toEqual(["a.com"]);
    expect(affectedDomains("domain_verified", domains)).toEqual(["b.com"]);
    expect(affectedDomains("dns_records", domains)).toEqual(["b.com"]);
    expect(affectedDomains("webhook", domains)).toEqual([]);
  });

  it("adds copy and the fix where the API allows one, and drops unknown keys", () => {
    const now = new Date();
    const dto = toChecklistDTO(
      [
        { key: "open_tracking", status: "warn", checkedAt: now },
        { key: "receiving", status: "warn", checkedAt: now },
        { key: "webhook", status: "fail", checkedAt: now },
        { key: "old_key", status: "ok", checkedAt: now },
      ],
      domains,
    );
    expect(dto.map((i) => i.key)).toEqual(["open_tracking", "receiving", "webhook"]);
    expect(dto[0]).toMatchObject({
      title: "Read receipts",
      fix: { kind: "enable_open_tracking" },
      domains: ["a.com"],
    });
    expect(dto[1]!.fix).toBeNull(); // DNS/MX can't be fixed through the API
    expect(dto[2]!.fix).toMatchObject({ kind: "reregister_webhook" });
    expect(toChecklistDTO(undefined)).toEqual([]);
  });

  it("every warn/fail state has plain copy, and ok never offers a fix", () => {
    for (const key of CHECKLIST_KEYS) {
      expect(describeChecklistItem(key, "ok").fix).toBeNull();
      expect(describeChecklistItem(key, "ok").detail).not.toBe("");
    }
    expect(summarizeChecklist([{ status: "ok" }, { status: "warn" }, { status: "fail" }])).toEqual({
      ok: 1,
      warn: 1,
      fail: 1,
      total: 3,
    });
  });
});
