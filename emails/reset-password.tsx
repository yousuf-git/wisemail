import { Text } from "@react-email/components";

import { CodeBlock, EmailLayout, LinkFallback, PrimaryButton, text } from "./layout";

/** `code` is the 6-digit one-time code; `url` the reset link. A message carries either or both. */
export type ResetPasswordProps = { name: string; url?: string | null; code?: string | null };

/** A code-only message leads with the code; one with a link keeps the plain subject. */
export const resetPasswordSubject = (code?: string | null, hasLink = true) =>
  code && !hasLink ? `${code} is your Wisemail reset code` : "Reset your Wisemail password";

export default function ResetPassword({ name, url, code }: ResetPasswordProps) {
  return (
    <EmailLayout
      preview={code ? `Your reset code is ${code}` : "Pick a new password for Wisemail."}
    >
      <Text style={text.h1}>Let&apos;s get you back in</Text>
      <Text style={text.p}>
        Hi {name.split(" ")[0] || "there"}, someone asked to reset the password for this Wisemail
        account. If that was you,{" "}
        {code ? "enter this code on the reset page" : "pick a new one below"}
        {code && url ? ", or use the button below" : ""}.
      </Text>
      {code ? <CodeBlock code={code} /> : null}
      {url ? <PrimaryButton href={url}>Choose a new password</PrimaryButton> : null}
      <Text style={text.small}>
        {code ? "The code works for 10 minutes" : ""}
        {code && url ? " and the link for an hour" : url ? "This link works for an hour" : ""}, and
        can be used once. Didn&apos;t ask for this? Ignore this message and your password stays as
        it is.
      </Text>
      {url ? <LinkFallback href={url} /> : null}
    </EmailLayout>
  );
}

ResetPassword.PreviewProps = {
  name: "Sam Rivera",
  url: "https://app.wisemail.dev/reset",
  code: "482913",
};
