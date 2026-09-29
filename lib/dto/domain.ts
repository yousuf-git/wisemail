/** Client-safe shapes for the Domains and API keys pages. No secrets, no ciphertext. */

export type DnsRecordDTO = {
  /** `SPF`, `DKIM`, `Receiving`, ... */
  record: string;
  type: string;
  name: string;
  value: string;
  priority: number | null;
  status: string;
};

export type DnsVerdictValue = "pass" | "fail" | "missing" | "unknown" | "skipped";

export type DnsCheckDetailDTO = {
  group: "spf" | "dkim" | "dmarc" | "mx";
  type: string;
  name: string;
  expected: string;
  found: string[];
  verdict: DnsVerdictValue;
  message: string;
};

export type DnsCheckDTO = {
  checkedAt: string;
  spf: DnsVerdictValue;
  dkim: DnsVerdictValue;
  dmarc: DnsVerdictValue;
  mx: DnsVerdictValue;
  details: DnsCheckDetailDTO[];
};

export type DomainDTO = {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  status: string;
  region: string | null;
  openTracking: boolean;
  clickTracking: boolean;
  receivingEnabled: boolean;
  receivingVerified: boolean;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  records: DnsRecordDTO[];
  dnsCheck: DnsCheckDTO | null;
  senderCount: number;
  createdAt: string | null;
};

export type ApiKeyDTO = {
  id: string;
  connectionId: string;
  connectionName: string;
  name: string;
  /** `null` = unknown: Resend's list endpoint doesn't return it for keys made elsewhere. */
  permission: "full_access" | "sending_access" | null;
  domainId: string | null;
  domainName: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  createdViaApp: boolean;
  /**
   * `exact`: this is the key Wisemail authenticates with for the connection.
   * `possible`: named like a Wisemail key and not created here, so it may be the one in use.
   */
  inUse: "exact" | "possible" | null;
  /** Last 4 characters of the connection's key, to help recognise it in Resend. */
  connectionKeyLast4: string | null;
  /** Full-access key older than the warning threshold. */
  stale: boolean;
};

export type CreatedApiKeyDTO = {
  key: ApiKeyDTO;
  /** Shown once. Never stored, never returned again. */
  secret: string;
};
