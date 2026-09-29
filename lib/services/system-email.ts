import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { Resend } from "resend";

import AlertFired, { alertFiredSubject, type AlertFiredProps } from "@/emails/alert-fired";
import DailyDigest, { digestSubject, type DigestProps } from "@/emails/daily-digest";
import Invitation, { invitationSubject, type InvitationProps } from "@/emails/invitation";
import ResetPassword, {
  resetPasswordSubject,
  type ResetPasswordProps,
} from "@/emails/reset-password";
import VerifyEmail, { verifyEmailSubject, type VerifyEmailProps } from "@/emails/verify-email";
import { env } from "@/lib/env";

/**
 * System email (TRD §1): verification, password reset, invitations, alerts and digests, sent from
 * Wisemail's own Resend account, never through a customer's connection.
 *
 * `RESEND_MODE=live` sends with `SYSTEM_RESEND_API_KEY` from `SYSTEM_FROM_EMAIL`. In fake mode
 * nothing leaves the process: messages land in an in-memory outbox (tests read it), in
 * development they are also written to `.data/outbox/*.html` (+ a `.json` sidecar the
 * `/dev/outbox` page lists) and a line with the message's link is logged.
 */

export type SystemEmailKind =
  "verify-email" | "reset-password" | "invitation" | "alert-fired" | "daily-digest";

export type OutboxEntry = {
  id: string;
  kind: SystemEmailKind;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** The message's main call-to-action link, when it has one. */
  link: string | null;
  sentAt: string;
};

export class SystemEmailError extends Error {
  readonly code = "system_email_failed";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SystemEmailError";
  }
}

const MAX_OUTBOX = 200;
const globalForOutbox = globalThis as unknown as { __wisemailOutbox?: OutboxEntry[] };
const outbox = () => (globalForOutbox.__wisemailOutbox ??= []);

/** Fake-mode outbox, oldest first. */
export const getOutbox = (): readonly OutboxEntry[] => outbox();
export const clearOutbox = () => void (outbox().length = 0);
/** Latest message to `to` (of `kind`), for tests and the dev outbox. */
export function findOutbox(to: string, kind?: SystemEmailKind): OutboxEntry | undefined {
  return [...outbox()]
    .reverse()
    .find((m) => m.to.toLowerCase() === to.toLowerCase() && (!kind || m.kind === kind));
}

export const OUTBOX_DIR = path.join(process.cwd(), ".data", "outbox");

/** Fake mode is never allowed to swallow mail in production. */
export const systemEmailIsFake = () => env.RESEND_MODE === "fake";

async function renderMessage(element: ReactElement) {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}

async function deliver(
  kind: SystemEmailKind,
  to: string,
  subject: string,
  element: ReactElement,
  link: string | null,
  tags: { name: string; value: string }[] = [],
): Promise<void> {
  const { html, text } = await renderMessage(element);

  if (env.RESEND_MODE === "live") {
    const resend = new Resend(env.SYSTEM_RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.SYSTEM_FROM_EMAIL!,
      to,
      subject,
      html,
      text,
      tags: [{ name: "kind", value: kind }, ...tags],
    });
    if (error) throw new SystemEmailError(`Resend rejected the ${kind} email: ${error.message}`);
    return;
  }

  const entry: OutboxEntry = {
    id: crypto.randomUUID(),
    kind,
    to,
    subject,
    html,
    text,
    link,
    sentAt: new Date().toISOString(),
  };
  const box = outbox();
  box.push(entry);
  if (box.length > MAX_OUTBOX) box.splice(0, box.length - MAX_OUTBOX);

  if (env.NODE_ENV === "development") {
    const slug = to.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
    const base = `${entry.sentAt.replace(/[:.]/g, "-")}-${kind}-${slug}`;
    try {
      await mkdir(OUTBOX_DIR, { recursive: true });
      await writeFile(path.join(OUTBOX_DIR, `${base}.html`), html);
      await writeFile(
        path.join(OUTBOX_DIR, `${base}.json`),
        JSON.stringify({ ...entry, html: undefined, text: undefined, file: `${base}.html` }),
      );
    } catch (error) {
      console.warn("[system-email] could not write the dev outbox file", error);
    }
    console.info(`[system-email] ${kind} to ${to}${link ? `: ${link}` : ""}`);
  }
}

/* ---------------------------------- typed senders ---------------------------------- */

export const sendVerificationEmail = (to: string, props: VerifyEmailProps) =>
  deliver("verify-email", to, verifyEmailSubject(), VerifyEmail(props), props.url);

export const sendPasswordResetEmail = (to: string, props: ResetPasswordProps) =>
  deliver("reset-password", to, resetPasswordSubject(), ResetPassword(props), props.url);

export const sendInvitationEmail = (to: string, props: InvitationProps) =>
  deliver("invitation", to, invitationSubject(props), Invitation(props), props.url);

export const sendAlertEmail = (to: string, props: AlertFiredProps) =>
  deliver("alert-fired", to, alertFiredSubject(props), AlertFired(props), props.url);

export const sendDigestEmail = (to: string, props: DigestProps) =>
  deliver("daily-digest", to, digestSubject(props), DailyDigest(props), props.url);
