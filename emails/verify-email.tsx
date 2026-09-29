import { Text } from "@react-email/components";

import { EmailLayout, LinkFallback, PrimaryButton, text } from "./layout";

export type VerifyEmailProps = { name: string; url: string };

export const verifyEmailSubject = () => "Confirm your email for Wisemail";

export default function VerifyEmail({ name, url }: VerifyEmailProps) {
  return (
    <EmailLayout preview="One quick step and you're in.">
      <Text style={text.h1}>Welcome, {name.split(" ")[0] || "there"}</Text>
      <Text style={text.p}>
        One quick step and you&apos;re in. Confirm that this is your email address and we&apos;ll
        take you straight to your workspace.
      </Text>
      <PrimaryButton href={url}>Confirm email</PrimaryButton>
      <Text style={text.small}>
        This link works for an hour. If you didn&apos;t create a Wisemail account, you can ignore
        this message.
      </Text>
      <LinkFallback href={url} />
    </EmailLayout>
  );
}

VerifyEmail.PreviewProps = { name: "Sam Rivera", url: "https://app.wisemail.dev/verify" };
