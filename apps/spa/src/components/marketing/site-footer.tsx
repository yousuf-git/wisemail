import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Wizi } from "@/components/mascot/wizi";
import { Logomark } from "./logo";
import { Container, Reveal, Tone } from "./section";
import { SectionLink } from "./smooth-scroll";

const columns = [
  {
    heading: "Product",
    links: [
      { href: "/#product", label: "Product" },
      { href: "/#how", label: "How it works" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/sign-in", label: "Sign in" },
      { href: "/sign-up", label: "Start free" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

function FooterLink({ href, label }: { href: string; label: string }) {
  const className = "text-sm text-ink-secondary transition-colors hover:text-ink";
  return href.startsWith("/#") ? (
    <SectionLink section={href.slice(2)} className={className}>
      {label}
    </SectionLink>
  ) : (
    <Link to={href} className={className}>
      {label}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <Tone
      tone="dark"
      as="footer"
      className="relative overflow-hidden rounded-t-[2.5rem] pt-20 sm:rounded-t-[3.5rem] sm:pt-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_40%_at_85%_30%,color-mix(in_oklab,var(--glow)_14%,transparent),transparent_70%),radial-gradient(45%_45%_at_0%_100%,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_70%)]"
      />
      <Container className="relative grid gap-20">
        <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Reveal className="grid gap-8">
            <p className="font-display text-[clamp(2.75rem,7.5vw,6rem)] leading-[0.95] font-extrabold tracking-[-0.055em] text-balance">
              Your Resend,
              <span className="block text-ink-muted">wiser from here.</span>
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/sign-up"
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-ink pr-5 pl-6 text-[0.9375rem] font-semibold text-canvas transition-transform duration-300 active:scale-[0.98]"
              >
                Start free
                <ArrowRight
                  className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
              <span className="text-sm text-ink-muted">Free plan forever. Pro trial, no card.</span>
            </div>
          </Reveal>
          <Wizi mood="happy" size={180} className="hidden justify-self-end lg:block" />
        </div>

        <div className="grid grid-cols-3 gap-x-4 gap-y-10 border-t border-line pt-12 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="col-span-3 grid content-start gap-3 sm:col-span-1">
            <Link
              to="/"
              aria-label="Wisemail home"
              className="inline-flex items-center gap-2.5 font-display text-base font-bold tracking-[-0.03em]"
            >
              <Logomark className="size-7" />
              Wisemail
            </Link>
            <p className="max-w-[28ch] text-sm leading-6 text-ink-muted">
              The control room for every Resend account, domain and inbox you run.
            </p>
          </div>
          {columns.map((c) => (
            <nav key={c.heading} aria-label={c.heading} className="grid content-start gap-3">
              <p className="text-sm font-semibold">{c.heading}</p>
              {c.links.map((l) => (
                <FooterLink key={l.href} {...l} />
              ))}
            </nav>
          ))}
        </div>
      </Container>

      <div className="relative mt-16 overflow-hidden select-none" aria-hidden>
        <p className="translate-y-[22%] bg-gradient-to-b from-line-strong to-transparent bg-clip-text text-center font-display text-[22vw] leading-[0.8] font-extrabold tracking-[-0.07em] text-transparent">
          Wisemail
        </p>
      </div>
      <Container className="relative border-t border-line py-6">
        <p className="text-xs text-ink-muted">
          © {new Date().getFullYear()} Wisemail. Not affiliated with Resend.
        </p>
      </Container>
    </Tone>
  );
}
