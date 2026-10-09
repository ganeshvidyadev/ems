import { HeroGlow } from '@/components/hero-glow';

/** A shorter banner for secondary pages (About, Products, Careers, Contact, Plans) —
 * ported from Automark's `PageHeader.astro`. */
export function PageHero({ heading, subheading }: { heading: string; subheading: string }) {
  return (
    <section className="section-ph relative mb-0 overflow-hidden pb-28">
      <div className="container relative">
        <div className="mx-auto text-center lg:max-w-3xl">
          <h1 className="hasHighlight mb-6">{heading}</h1>
          <p className="mb-5 text-lg">{subheading}</p>
        </div>
      </div>
      <HeroGlow />
    </section>
  );
}
