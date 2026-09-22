import type { WebsiteHeroContent } from '@ems/contracts';

export function HeroSection({ content }: { content: WebsiteHeroContent }) {
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
        {content.eyebrow && (
          <p className="mx-auto mb-4 max-w-3xl text-sm font-semibold uppercase tracking-wide text-fuchsia-600">
            {content.eyebrow}
          </p>
        )}
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          {content.titlePrefix}{' '}
          <span className="bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-amber-500 bg-clip-text text-transparent">
            {content.titleHighlight}
          </span>{' '}
          {content.titleSuffix}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-muted">{content.subtitle}</p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href={content.primaryCtaHref}
            className="rounded-md bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-fuchsia-500/20 hover:from-indigo-500 hover:to-fuchsia-500"
          >
            {content.primaryCtaLabel}
          </a>
          {content.secondaryCtaLabel && (
            <a href={content.secondaryCtaHref} className="text-sm font-medium text-ink hover:text-fuchsia-600">
              {content.secondaryCtaLabel}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
