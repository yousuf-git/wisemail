import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Logo } from "./logo";
import { Container } from "./section";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how", label: "How it works" },
      { href: "/#compare", label: "Resend and Wisemail" },
      { href: "/pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/sign-in", label: "Sign in" },
      { href: "/sign-up", label: "Get started" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-canvas-sunken">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="grid content-start gap-3">
          <Logo />
          <p className="max-w-[30ch] text-sm leading-6 text-ink-secondary">
            Wiser insights and more control over your emails. Built on top of your own Resend
            account.
          </p>
        </div>
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title} className="grid content-start gap-2">
            <p className="text-xs font-semibold tracking-[0.06em] text-ink-secondary uppercase">
              {c.title}
            </p>
            {c.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="w-fit text-sm text-ink-secondary transition-colors hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        ))}
      </Container>
      <Container className="flex flex-col gap-4 border-t border-line py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-ink-secondary">
          © {new Date().getFullYear()} Wisemail. An independent product, not affiliated with Resend.
          Resend is a trademark of its owner.
        </p>
        <ThemeToggle className="self-start" />
      </Container>
    </footer>
  );
}
