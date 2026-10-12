import type { Metadata } from "next";
import Image from "next/image";

import { Compare } from "@/components/marketing/compare";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { Reveal } from "@/components/marketing/reveal";
import { Container, SectionHeading, Tone } from "@/components/marketing/section";
import { Trust } from "@/components/marketing/trust";

const title = "Wisemail: wiser insights and more control over your Resend email";
const description =
  "Connect your Resend account in a minute. Inbox, read receipts, insights and alerts — free plan, no card.";

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
      {/* Compare sticks; Pricing slides over it. */}
      <div className="relative">
        <div className="sticky top-0 z-0">
          <Compare />
        </div>

        <Tone
          tone="light"
          as="section"
          id="pricing"
          className="relative z-10 scroll-mt-28 overflow-hidden rounded-t-[2rem] py-24 shadow-[0_-24px_64px_-28px_rgba(0,0,0,0.35)] sm:py-32"
        >
          <Image
            src="/marketing/pricing-grain.jpg"
            alt=""
            fill
            aria-hidden
            sizes="100vw"
            className="pointer-events-none object-cover opacity-30 mix-blend-multiply"
          />
          <Container className="relative grid gap-12">
            <Reveal>
              <SectionHeading
                eyebrow="Pricing"
                title="Start free. Upgrade when you need to."
                description="One plan covers transactional and marketing on your Resend account."
              />
            </Reveal>
            <Reveal delay={0.06}>
              <PricingPlans />
            </Reveal>
          </Container>
        </Tone>
      </div>
      <Trust />
      <Faq />
    </>
  );
}
