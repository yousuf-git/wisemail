/**
 * Every object key is built here so no code concatenates paths by hand (TRD §2.13). Org id comes
 * first so an org can be purged by prefix.
 */

const SAFE = /^[A-Za-z0-9_-]{1,64}$/;

function seg(value: { toString(): string }, label: string): string {
  const s = value.toString();
  if (!SAFE.test(s)) throw new Error(`Invalid ${label} in storage key`);
  return s;
}

type Id = { toString(): string };

export const storageKeys = {
  /** Raw inbound MIME. */
  inboundRaw: (orgId: Id, emailId: Id) =>
    `orgs/${seg(orgId, "orgId")}/inbound/${seg(emailId, "emailId")}/raw.eml`,
  inboundAttachment: (orgId: Id, emailId: Id, attachmentId: Id) =>
    `orgs/${seg(orgId, "orgId")}/inbound/${seg(emailId, "emailId")}/att/${seg(attachmentId, "attachmentId")}`,
  /** Outbound attachment, after send. */
  outboundAttachment: (orgId: Id, emailId: Id, attachmentId: Id) =>
    `orgs/${seg(orgId, "orgId")}/outbound/${seg(emailId, "emailId")}/att/${seg(attachmentId, "attachmentId")}`,
  /** Draft upload, before send. */
  draftUpload: (orgId: Id, draftId: Id, attachmentId: Id) =>
    `drafts/${seg(orgId, "orgId")}/${seg(draftId, "draftId")}/${seg(attachmentId, "attachmentId")}`,
  orgPrefix: (orgId: Id) => `orgs/${seg(orgId, "orgId")}/`,
  emailPrefix: (orgId: Id, emailId: Id) =>
    `orgs/${seg(orgId, "orgId")}/inbound/${seg(emailId, "emailId")}/`,
} as const;
