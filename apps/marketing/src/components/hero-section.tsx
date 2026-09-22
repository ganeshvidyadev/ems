export function HeroSection() {
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
      <div className="relative mx-auto max-w-content px-6 py-24 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          The{' '}
          <span className="bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-amber-500 bg-clip-text text-transparent">
            multi-tenant e-commerce platform
          </span>{' '}
          behind your store
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-muted">
          Merchants sign up, pick a plan, and get a fully provisioned online store — payments,
          logistics, a website builder, and multi-channel selling, all in one platform.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href="mailto:hello@ems.app"
            className="rounded-md bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-fuchsia-500/20 hover:from-indigo-500 hover:to-fuchsia-500"
          >
            Request access
          </a>
          <a href="#features" className="text-sm font-medium text-ink hover:text-fuchsia-600">
            See what&rsquo;s inside &rarr;
          </a>
        </div>
      </div>
    </section>
  );
}
