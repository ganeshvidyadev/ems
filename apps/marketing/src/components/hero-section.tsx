export function HeroSection() {
  return (
    <section className="border-b border-line bg-surface-alt">
      <div className="mx-auto max-w-content px-6 py-24 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          The multi-tenant e-commerce platform behind your store
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-muted">
          Merchants sign up, pick a plan, and get a fully provisioned online store — payments,
          logistics, a website builder, and multi-channel selling, all in one platform.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href="mailto:hello@ems.app"
            className="rounded-md bg-brand px-6 py-3 text-sm font-medium text-brand-foreground hover:bg-brand-muted"
          >
            Request access
          </a>
          <a href="#features" className="text-sm font-medium text-ink hover:text-brand">
            See what&rsquo;s inside &rarr;
          </a>
        </div>
      </div>
    </section>
  );
}
