import { Text } from "@react-email/components";

import { EmailLayout, LinkFallback, PrimaryButton, text } from "./layout";

export type InvitationProps = {
  orgName: string;
  inviterName: string;
  roleLabel: string;
  url: string;
  expiresInDays: number;
};

export const invitationSubject = ({ inviterName, orgName }: InvitationProps) =>
  `${inviterName} invited you to ${orgName} on Wisemail`;

export default function Invitation(props: InvitationProps) {
  const { orgName, inviterName, roleLabel, url, expiresInDays } = props;
  return (
    <EmailLayout preview={`Join ${orgName} on Wisemail as ${roleLabel}.`}>
      <Text style={text.h1}>Join {orgName}</Text>
      <Text style={text.p}>
        {inviterName} invited you to {orgName} on Wisemail as {roleLabel}. Wisemail keeps a
        team&apos;s email, insights and alerts in one place.
      </Text>
      <PrimaryButton href={url}>Accept invitation</PrimaryButton>
      <Text style={text.small}>
        Use the address this message was sent to; you&apos;ll be asked to confirm it before you can
        join. The invitation expires in {expiresInDays} {expiresInDays === 1 ? "day" : "days"}.
      </Text>
      <LinkFallback href={url} />
    </EmailLayout>
  );
}

Invitation.PreviewProps = {
  orgName: "Acme",
  inviterName: "Jo",
  roleLabel: "Developer",
  url: "https://app.wisemail.dev/invite/token",
  expiresInDays: 7,
};
