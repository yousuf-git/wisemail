import { Column, Hr, Link, Row, Section, Text } from "@react-email/components";

import { EmailLayout, PrimaryButton, text } from "./layout";
import { color } from "./tokens";

export type DigestProps = {
  orgName: string;
  /** e.g. "Tuesday, 29 September" in the org's time zone. */
  dateLabel: string;
  stats: {
    sent: number;
    delivered: number;
    bounced: number;
    complained: number;
    opened: number;
    received: number;
  };
  incidents: { title: string; status: "open" | "resolved" | "acknowledged"; url: string }[];
  unreadNotifications: number;
  url: string;
};

export const digestSubject = ({ orgName, dateLabel }: DigestProps) =>
  `${orgName} daily digest, ${dateLabel}`;

const fmt = (n: number) => n.toLocaleString("en-US");

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Column style={{ width: "33%", paddingBottom: "12px" }}>
      <Text style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: color.ink }}>
        {fmt(value)}
      </Text>
      <Text style={{ margin: 0, fontSize: "12px", color: color.inkMuted }}>{label}</Text>
    </Column>
  );
}

export default function DailyDigest(props: DigestProps) {
  const { orgName, dateLabel, stats, incidents, unreadNotifications, url } = props;
  const quiet = stats.sent + stats.received === 0;
  return (
    <EmailLayout
      preview={
        quiet
          ? "A quiet day. Nothing needs you."
          : `${fmt(stats.sent)} sent, ${fmt(stats.bounced)} bounced.`
      }
      footer={`You get this daily digest for ${orgName}. Turn it off in Settings, Notifications.`}
    >
      <Text style={text.h1}>Your day in email</Text>
      <Text style={text.p}>
        {orgName} · {dateLabel}.{" "}
        {quiet ? "A quiet day. Nothing needs you." : "Here's how the last 24 hours went."}
      </Text>
      <Section>
        <Row>
          <Stat label="Sent" value={stats.sent} />
          <Stat label="Delivered" value={stats.delivered} />
          <Stat label="Opened" value={stats.opened} />
        </Row>
        <Row>
          <Stat label="Bounced" value={stats.bounced} />
          <Stat label="Complaints" value={stats.complained} />
          <Stat label="Received" value={stats.received} />
        </Row>
      </Section>
      <Hr style={{ borderColor: color.line, margin: "8px 0 16px" }} />
      {incidents.length > 0 ? (
        <>
          <Text style={{ ...text.p, margin: "0 0 8px", fontWeight: 700, color: color.ink }}>
            Alerts
          </Text>
          {incidents.map((i) => (
            <Text key={i.url} style={{ ...text.p, margin: "0 0 6px" }}>
              <Link href={i.url} style={{ color: color.accent, fontWeight: 600 }}>
                {i.title}
              </Link>{" "}
              <span style={{ color: i.status === "open" ? color.dangerInk : color.successInk }}>
                {i.status === "open" ? "open" : i.status}
              </span>
            </Text>
          ))}
        </>
      ) : (
        <Text style={text.p}>No alerts fired. Smooth sailing.</Text>
      )}
      {unreadNotifications > 0 ? (
        <Text style={text.p}>
          You have {unreadNotifications} unread{" "}
          {unreadNotifications === 1 ? "notification" : "notifications"}.
        </Text>
      ) : null}
      <PrimaryButton href={url}>Open Wisemail</PrimaryButton>
    </EmailLayout>
  );
}

DailyDigest.PreviewProps = {
  orgName: "Acme",
  dateLabel: "Tuesday, 29 September",
  stats: { sent: 1240, delivered: 1205, bounced: 14, complained: 1, opened: 610, received: 32 },
  incidents: [
    {
      title: "Bounce rate is 6.2% on acme.com",
      status: "resolved",
      url: "https://app.wisemail.dev/x",
    },
  ],
  unreadNotifications: 3,
  url: "https://app.wisemail.dev/acme",
};
