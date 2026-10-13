import { Text } from "@react-email/components";

import { EmailLayout, LinkFallback, PrimaryButton, text } from "./layout";
import { color } from "./tokens";

export type AlertFiredProps = {
  orgName: string;
  title: string;
  /** One plain sentence: what was seen and what the rule expected. */
  summary: string;
  url: string;
  /** `resolved` renders the calmer "all clear" variant; `info` is for other notifications. */
  state?: "open" | "resolved" | "info";
  /** Extra address recipients (not members) see a different footer. */
  external?: boolean;
};

export const alertFiredSubject = ({ title, state }: AlertFiredProps) =>
  state === "resolved" ? `Resolved: ${title}` : state === "info" ? title : `Alert: ${title}`;

export default function AlertFired({
  orgName,
  title,
  summary,
  url,
  state,
  external,
}: AlertFiredProps) {
  const resolved = state === "resolved";
  const info = state === "info";
  return (
    <EmailLayout
      preview={summary}
      footer={
        external
          ? `Someone on the ${orgName} team added this address to an alert rule in Wisemail.`
          : `You get this because of your notification settings in ${orgName}. Change what reaches you in Settings, Notifications.`
      }
    >
      <Text
        style={{
          backgroundColor: resolved
            ? color.successSoft
            : info
              ? color.canvasSunken
              : color.dangerSoft,
          color: resolved ? color.successInk : info ? color.inkSecondary : color.dangerInk,
          borderRadius: "999px",
          display: "inline-block",
          padding: "3px 12px",
          fontSize: "12px",
          fontWeight: 700,
          margin: "0 0 14px",
        }}
      >
        {resolved ? "Resolved" : info ? "Heads up" : "Needs a look"}
      </Text>
      <Text style={text.h1}>{title}</Text>
      <Text style={text.p}>{summary}</Text>
      <PrimaryButton href={url}>
        {resolved ? "See what happened" : info ? "Take a look" : "Open the incident"}
      </PrimaryButton>
      <LinkFallback href={url} />
    </EmailLayout>
  );
}

AlertFired.PreviewProps = {
  orgName: "Acme",
  title: "Bounce rate is 6.2% on acme.com",
  summary: "6.2% of the last 240 emails bounced over the past hour. Your rule alerts above 3%.",
  url: "https://app.wisemail.dev/acme/alerts/incidents/1",
  state: "open",
};
