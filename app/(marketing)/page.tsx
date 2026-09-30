import type { Metadata } from "next";

import { Compare } from "@/components/marketing/compare";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { Reveal } from "@/components/marketing/reveal";
import { Container, SectionHeading } from "@/components/marketing/section";
import { Trust } from "@/components/marketing/trust";

const title = "Wisemail: wiser insights and more control over your Resend email";
const description =
  "Connect your Resend account in a minute and get an inbox, read receipts, insights and alerts on top of it. Free plan, no card.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/" },
  twitter: { title, description },
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Features />
      <Compare />
      <section
        id="pricing"
        className="scroll-mt-20 border-y border-line bg-canvas-sunken py-20 sm:py-28"
      >
        <Container className="grid gap-10">
          <Reveal>
            <SectionHeading
              eyebrow="Pricing"
              title="One plan covers transactional and marketing"
              description="Start free. Pick a paid plan when you need more accounts, more history or a team."
            />
          </Reveal>
          <Reveal delay={0.05}>
            <PricingPlans />
          </Reveal>
        </Container>
      </section>
      <Trust />
      <Faq />
      <FinalCta />
    </>
  );
}
