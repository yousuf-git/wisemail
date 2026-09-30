import { Text } from "@react-email/components";

import { CodeBlock, EmailLayout, LinkFallback, PrimaryButton, text } from "./layout";

/** `code` is the 6-digit one-time code; `url` the confirmation link. A message carries either or both. */
export type VerifyEmailProps = { name: string; url?: string | null; code?: string | null };

/** A code-only message leads with the code; one with a link keeps the plain subject. */
export const verifyEmailSubject = (code?: string | null, hasLink = true) =>
  code && !hasLink ? `${code} is your Wisemail code` : "Confirm your email for Wisemail";

export default function VerifyEmail({ name, url, code }: VerifyEmailProps) {
  return (
    <EmailLayout preview={code ? `Your code is ${code}` : "One quick step and you're in."}>
      <Text style={text.h1}>Welcome, {name.split(" ")[0] || "there"}</Text>
      <Text style={text.p}>
        One quick step and you&apos;re in. Confirm that this is your email address
        {code ? " with this code" : ""}
        {code && url ? ", or with the button below" : ""}.
      </Text>
      {code ? <CodeBlock code={code} /> : null}
      {url ? <PrimaryButton href={url}>Confirm email</PrimaryButton> : null}
      <Text style={text.small}>
        {code ? "The code works for 10 minutes" : ""}
        {code && url ? " and the link for an hour" : url ? "This link works for an hour" : ""}. If
        you didn&apos;t create a Wisemail account, you can ignore this message.
      </Text>
      {url ? <LinkFallback href={url} /> : null}
    </EmailLayout>
  );
}

VerifyEmail.PreviewProps = {
  name: "Sam Rivera",
  url: "https://app.wisemail.dev/verify",
  code: "482913",
};
