/** A shorter banner for secondary pages (About, Products, Careers, Contact) — same
 * gradient language as the home hero, without the two-CTA layout that page owns. */
export function PageHero({ heading, subheading }: { heading: string; subheading: string }) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-br from-indigo-50 via-fuchsia-50 to-amber-50">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-violet-300/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-amber-300/40 blur-3xl"
      />
      <div className="relative mx-auto max-w-content px-6 py-20 text-center">
        <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-ink">{heading}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-muted">{subheading}</p>
      </div>
    </section>
  );
}
