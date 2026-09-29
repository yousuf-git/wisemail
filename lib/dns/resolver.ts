import { Resolver } from "node:dns/promises";

/**
 * The DNS lookups the checker needs. Kept tiny so tests inject a fake and the checker never
 * touches the network. Every method resolves to an empty array when the name has no such
 * record (NXDOMAIN / NODATA) and rejects with `DnsLookupError` when the lookup itself failed
 * (timeout, SERVFAIL, refused), which the checker reports as `unknown` instead of `missing`.
 */
export interface DnsResolver {
  /** TXT records, each joined from its character-strings. */
  resolveTxt(name: string): Promise<string[]>;
  resolveMx(name: string): Promise<{ exchange: string; priority: number }[]>;
  resolveCname(name: string): Promise<string[]>;
}

export class DnsLookupError extends Error {
  constructor(
    readonly reason: "timeout" | "servfail" | "error",
    message: string,
  ) {
    super(message);
    this.name = "DnsLookupError";
  }
}

/** Codes that mean "the answer is: there is no such record". */
const EMPTY_CODES = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN", "NOTFOUND"]);
const TIMEOUT_CODES = new Set(["ETIMEOUT", "ETIMEDOUT", "ECONNREFUSED", "ECANCELLED"]);

export function classifyDnsError(error: unknown): "empty" | DnsLookupError {
  const code = (error as { code?: string } | null)?.code ?? "";
  if (EMPTY_CODES.has(code)) return "empty";
  const message = error instanceof Error ? error.message : String(error);
  if (TIMEOUT_CODES.has(code)) return new DnsLookupError("timeout", message);
  if (code === "ESERVFAIL" || code === "EREFUSED") return new DnsLookupError("servfail", message);
  return new DnsLookupError("error", message);
}

export type NodeResolverOptions = {
  /** Per attempt, in milliseconds. */
  timeoutMs?: number;
  tries?: number;
  servers?: string[];
};

/**
 * Resolver backed by `node:dns/promises`, with a hard timeout per lookup: c-ares' own timeout
 * is per try, so the outer race also bounds the whole call (and cancels it).
 */
export function createNodeResolver(options: NodeResolverOptions = {}): DnsResolver {
  const timeoutMs = options.timeoutMs ?? 3000;
  const tries = options.tries ?? 1;

  async function run<T>(fn: (r: Resolver) => Promise<T>): Promise<T | null> {
    const resolver = new Resolver({ timeout: timeoutMs, tries });
    if (options.servers?.length) resolver.setServers(options.servers);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          resolver.cancel();
          reject(new DnsLookupError("timeout", "DNS lookup timed out."));
        },
        timeoutMs * tries + 250,
      );
    });
    try {
      return await Promise.race([fn(resolver), limit]);
    } catch (error) {
      if (error instanceof DnsLookupError) throw error;
      const verdict = classifyDnsError(error);
      if (verdict === "empty") return null;
      throw verdict;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async resolveTxt(name) {
      const rows = await run((r) => r.resolveTxt(name));
      return (rows ?? []).map((chunks) => chunks.join(""));
    },
    async resolveMx(name) {
      return (await run((r) => r.resolveMx(name))) ?? [];
    },
    async resolveCname(name) {
      return (await run((r) => r.resolveCname(name))) ?? [];
    },
  };
}
