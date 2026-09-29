import { Text } from "@react-email/components";

import { EmailLayout, LinkFallback, PrimaryButton, text } from "./layout";

export type ResetPasswordProps = { name: string; url: string };

export const resetPasswordSubject = () => "Reset your Wisemail password";

export default function ResetPassword({ name, url }: ResetPasswordProps) {
  return (
    <EmailLayout preview="Pick a new password for Wisemail.">
      <Text style={text.h1}>Let&apos;s get you back in</Text>
      <Text style={text.p}>
        Hi {name.split(" ")[0] || "there"}, someone asked to reset the password for this Wisemail
        account. If that was you, pick a new one below.
      </Text>
      <PrimaryButton href={url}>Choose a new password</PrimaryButton>
      <Text style={text.small}>
        This link works for an hour and can be used once. Didn&apos;t ask for this? Ignore this
        message and your password stays as it is.
      </Text>
      <LinkFallback href={url} />
    </EmailLayout>
  );
}

ResetPassword.PreviewProps = { name: "Sam Rivera", url: "https://app.wisemail.dev/reset" };
