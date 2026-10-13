import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Wisemail.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      intro="The basics of using Wisemail."
      sections={[
        {
          heading: "Your Resend account",
          body: "Wisemail works with your own Resend account. You stay responsible for your Resend plan, your sending and your compliance with Resend's terms. Wisemail is an independent product and is not affiliated with Resend.",
        },
        {
          heading: "Plans and billing",
          body: "Plans, limits and prices are listed on the pricing page. Usage above a plan's allowance is handled as described there.",
        },
        {
          heading: "Acceptable use",
          body: "Use Wisemail to manage email you are entitled to send and receive. Don't use it to send spam or to break the law.",
        },
      ]}
    />
  );
}
