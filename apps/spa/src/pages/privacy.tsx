import { LegalPage } from "@/components/marketing/legal-page";
import { MarketingShell } from "@/components/marketing/marketing-shell";

export function PrivacyPage() {
  return (
    <MarketingShell>
      <LegalPage
        title="Privacy"
        intro="The short version of what Wisemail stores and why."
        sections={[
          {
            heading: "What we store",
            body: "Your account details, the Resend data you connect (domains, contacts, templates and the events and emails Resend reports), and the messages you send and receive through Wisemail.",
          },
          {
            heading: "Your Resend keys",
            body: "API keys and webhook secrets are encrypted at rest and are never sent back to your browser.",
          },
          {
            heading: "Deleting your data",
            body: "You can delete emails, remove a connection and its synced data, or delete your workspace. Resend keeps its own copy of your email under its own retention rules.",
          },
          {
            heading: "AI features",
            body: "AI is available on paid plans and can be turned off by an admin. Attachments are never sent to the model.",
          },
        ]}
      />
    </MarketingShell>
  );
}
