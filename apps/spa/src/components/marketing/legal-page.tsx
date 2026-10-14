import { Container, SectionHeading } from "./section";

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
}) {
  return (
    <Container className="grid max-w-[720px] gap-10 py-16 sm:py-24">
      <SectionHeading as="h1" title={title} description={intro} />
      <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-ink">
        This page is a short placeholder. The full text is published before Wisemail opens to the
        public.
      </p>
      {sections.map((s) => (
        <section key={s.heading} className="grid gap-2">
          <h2 className="text-lg font-bold tracking-[-0.01em]">{s.heading}</h2>
          <p className="text-[0.9375rem] leading-7 text-ink-secondary">{s.body}</p>
        </section>
      ))}
    </Container>
  );
}
