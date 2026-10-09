import type { WebsiteHeroContent } from '@ems/contracts';
import { HeroGlow } from '@/components/hero-glow';

/** Ported from the banner block in Automark's `index.astro` (`.section-ph`,
 * `hasHighlight` gradient-free purple-highlight title, `.btn` variants). The
 * particle-canvas / video-showcase decoration is dropped — out of scope. */
export function HeroSection({ content }: { content: WebsiteHeroContent }) {
  return (
    <section className="section-ph relative overflow-hidden">
      <div className="container relative">
        <div className="relative mb-20 text-center">
          {content.eyebrow && (
            <div className="badge mx-auto mb-8 flex max-w-max items-center gap-x-2 rounded-xl bg-white px-4 py-1.5 text-sm font-medium text-dark">
              {content.eyebrow}
            </div>
          )}
          <h1 className="hasHighlight mx-auto mb-8 lg:max-w-4xl">
            {content.titlePrefix} <strong className="text-primary">{content.titleHighlight}</strong> {content.titleSuffix}
          </h1>
          <p className="mx-auto mb-10 lg:max-w-2xl">{content.subtitle}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a href={content.primaryCtaHref} className="btn btn-primary">
              {content.primaryCtaLabel}
            </a>
            {content.secondaryCtaLabel && (
              <a href={content.secondaryCtaHref} className="btn btn-outline">
                {content.secondaryCtaLabel}
              </a>
            )}
          </div>
        </div>
      </div>
      <HeroGlow />
    </section>
  );
}
