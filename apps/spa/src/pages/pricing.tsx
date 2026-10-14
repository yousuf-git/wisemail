import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { Container, SectionHeading, Tone } from "@/components/marketing/section";

export function PricingPage() {
  return (
    <MarketingShell>
      <Tone tone="light" as="section" className="relative overflow-hidden py-16 sm:py-24">
        <img
          src="/marketing/pricing-grain.jpg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-25 mix-blend-multiply"
        />
        <Container className="relative grid gap-12">
          <SectionHeading
            as="h1"
            eyebrow="Pricing"
            title="Start free. Upgrade when you need to."
            description="One plan covers transactional and marketing on your Resend account."
          />
          <PricingPlans />
        </Container>
      </Tone>
    </MarketingShell>
  );
}
