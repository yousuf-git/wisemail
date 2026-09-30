import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Wizi } from "@/components/mascot/wizi";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";
import { Container } from "./section";

export function FinalCta() {
  return (
    <section className="pt-20 sm:pt-28">
      <Container>
        <Reveal>
          <div className="relative grid items-center gap-8 overflow-hidden rounded-xl border border-line bg-surface p-8 shadow-glow sm:p-12 md:grid-cols-[1fr_auto]">
            <div className="grid gap-4">
              <h2 className="text-3xl leading-[1.1] font-extrabold tracking-[-0.03em] text-balance sm:text-4xl">
                Let&apos;s connect your first Resend account.
              </h2>
              <p className="max-w-[48ch] text-base leading-7 text-ink-secondary">
                It takes about a minute. Paste a key, and your history and inbox start filling in.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
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
                  <Link href="/pricing">See pricing</Link>
                </Button>
              </div>
            </div>
            <div className="hidden justify-self-center md:block">
              <Wizi mood="happy" size={170} />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
