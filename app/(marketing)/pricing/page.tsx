import type { Metadata } from "next";

import { Faq, faqItems } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Reveal } from "@/components/marketing/reveal";
import { Container, SectionHeading } from "@/components/marketing/section";

const description =
  "Wisemail plans: Free, Pro, Team and Agency. One plan covers transactional and marketing email on your own Resend account.";

export const metadata: Metadata = {
  title: "Pricing",
  description,
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Wisemail pricing", description, url: "/pricing" },
  twitter: { title: "Wisemail pricing", description },
};

const pricingFaq = faqItems.filter((f) =>
  [
    "What counts as a tracked email?",
    "What happens if I go over my allowance?",
    "Is there a free trial?",
    "Do I still need Resend?",
  ].includes(f.q),
);

export default function PricingPage() {
  return (
    <>
      <section className="pt-14 pb-20 sm:pt-20">
        <Container className="grid gap-12">
          <Reveal>
            <SectionHeading
              as="h1"
              eyebrow="Pricing"
              title="Priced against your Resend bill, not on top of it"
              description="One plan covers transactional and marketing email. You pay Resend for sending and Wisemail for everything you learn from it."
            />
          </Reveal>
          <PricingPlans />
          <div className="grid min-w-0 gap-4">
            <h2 className="text-xl font-extrabold tracking-[-0.02em]">Compare every limit</h2>
            <PricingTable />
          </div>
        </Container>
      </section>
      <Faq items={pricingFaq} title="Pricing questions" />
      <FinalCta />
    </>
  );
}
