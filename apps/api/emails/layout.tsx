import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

import { color, font, mono } from "./tokens";

const styles = {
  body: { backgroundColor: color.canvas, margin: 0, padding: "32px 12px", fontFamily: font },
  brand: { fontSize: "18px", fontWeight: 800, color: color.ink, margin: "0 0 16px 4px" },
  card: {
    backgroundColor: color.surface,
    border: `1px solid ${color.line}`,
    borderRadius: "16px",
    padding: "32px",
    maxWidth: "520px",
  },
  footer: { fontSize: "12px", lineHeight: "18px", color: color.inkMuted, margin: "16px 4px 0" },
} satisfies Record<string, CSSProperties>;

export const text = {
  h1: {
    fontSize: "24px",
    lineHeight: "30px",
    fontWeight: 700,
    color: color.ink,
    margin: "0 0 12px",
    letterSpacing: "-0.02em",
  },
  p: { fontSize: "15px", lineHeight: "24px", color: color.inkSecondary, margin: "0 0 16px" },
  small: { fontSize: "13px", lineHeight: "20px", color: color.inkMuted, margin: "16px 0 0" },
} satisfies Record<string, CSSProperties>;

/** Shared frame: preheader, brand line, white card, quiet footer. */
export function EmailLayout({
  preview,
  children,
  footer,
}: {
  preview: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={{ maxWidth: "520px", margin: "0 auto" }}>
          <Text style={styles.brand}>Wisemail</Text>
          <Section style={styles.card}>{children}</Section>
          <Text style={styles.footer}>
            {footer ?? "Sent by Wisemail. Wiser insights and more control over your emails."}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: color.accent,
        color: color.accentInk,
        fontFamily: font,
        fontSize: "15px",
        fontWeight: 700,
        textDecoration: "none",
        borderRadius: "10px",
        padding: "12px 22px",
        display: "inline-block",
      }}
    >
      {children}
    </Button>
  );
}

/** "Button not working?" fallback with the raw URL. */
export function LinkFallback({ href }: { href: string }) {
  return (
    <>
      <Hr style={{ borderColor: color.line, margin: "24px 0 16px" }} />
      <Text style={{ ...text.small, margin: 0 }}>
        Button not working? Paste this link into your browser:
        <br />
        <Link href={href} style={{ color: color.accent, wordBreak: "break-all" }}>
          {href}
        </Link>
      </Text>
    </>
  );
}

/** The 6-digit code, big and easy to copy. Spaced in the middle so it reads as two groups. */
export function CodeBlock({ code }: { code: string }) {
  const grouped = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  return (
    <Section
      style={{
        backgroundColor: color.canvasSunken,
        borderRadius: "12px",
        padding: "16px 12px",
        textAlign: "center",
        margin: "0 0 20px",
      }}
    >
      <Text
        style={{
          fontFamily: mono,
          fontSize: "32px",
          lineHeight: "40px",
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: color.ink,
          margin: 0,
        }}
      >
        {grouped}
      </Text>
    </Section>
  );
}
