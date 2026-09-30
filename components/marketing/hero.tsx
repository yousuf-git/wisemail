import { ArrowRight, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { Wizi } from "@/components/mascot/wizi";
import { Button } from "@/components/ui/button";
import { HeroMock } from "./hero-mock";
import { Reveal } from "./reveal";
import { Container } from "./section";

const facts = [
  { icon: KeyRound, text: "Uses your own Resend account" },
  { icon: ShieldCheck, text: "API keys encrypted at rest" },
  { icon: Sparkles, text: "Free plan, no card" },
];

export function Hero() {
  return (
    <section className="relative overflow-x-clip pt-14 pb-6 sm:pt-20">
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 h-[520px] w-[920px] max-w-full -translate-x-1/2 bg-[radial-gradient(closest-side,var(--glow-soft),transparent)]"
      />
      <Container className="relative grid gap-12">
        <div className="grid max-w-3xl gap-6">
          <Reveal y={10}>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-secondary shadow-sm">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              The control room for your Resend accounts
            </p>
          </Reveal>
          <Reveal delay={0.05} y={14}>
            <h1 className="text-[2.5rem] leading-[1.03] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl">
              See what happens after you hit send.
            </h1>
          </Reveal>
          <Reveal delay={0.1} y={14}>
            <p className="max-w-[58ch] text-lg leading-8 text-pretty text-ink-secondary">
              Wisemail connects to Resend in a minute and keeps every event. You get an inbox, read
              receipts, insights and alerts on top of it, without writing a single webhook handler.
            </p>
          </Reveal>
          <Reveal delay={0.15} y={14}>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 rounded-md px-7 text-base font-bold">
                <Link href="/sign-up">
                  Start free <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-md px-6 text-base font-semibold"
              >
                <Link href="/#how">See how it works</Link>
              </Button>
            </div>
          </Reveal>
          <Reveal delay={0.2} y={10}>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-secondary">
              {facts.map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-2">
                  <Icon className="size-4 text-accent-fill" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={0.25} y={28} className="relative">
          <div className="pointer-events-none absolute -top-[68px] right-6 z-10 hidden lg:block">
            <div className="pointer-events-auto">
              <Wizi mood="wow" size={92} />
            </div>
          </div>
          <div className="mx-auto w-full max-w-[960px]">
            <HeroMock />
            <p className="mt-2 px-1 text-xs text-ink-muted">Illustration with sample data.</p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
