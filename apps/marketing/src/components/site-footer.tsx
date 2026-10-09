import type { WebsiteFooterContent } from '@ems/contracts';

/** Ported from Automark's `Footer.astro` — dark footer with a contact column and a
 * link column (the theme's 3-column layout is simplified to 2, since our schema
 * doesn't split links into titled groups). */
export function SiteFooter({ content }: { content: WebsiteFooterContent }) {
  return (
    <footer className="section relative overflow-hidden pb-0">
      <div className="container pb-10">
        <div className="flex flex-wrap gap-x-10 gap-y-10 lg:justify-between">
          <div className="mb-20 max-w-95 text-lg text-text">
            <p className="font-secondary text-xl font-bold text-white">EMS</p>
            {content.tagline && <p className="mt-6">{content.tagline}</p>}
            {content.email && (
              <a className="link mt-6 inline-block underline" href={`mailto:${content.email}`}>
                {content.email}
              </a>
            )}
            {content.phone && (
              <a className="link mt-4 block" href={`tel:${content.phone}`}>
                {content.phone}
              </a>
            )}
          </div>

          {content.links.length > 0 && (
            <div>
              <h3 className="footer-label">Links</h3>
              <ul>
                {content.links.map((link) => (
                  <li key={link.href} className="mb-5">
                    <a href={link.href} className="footer-link">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <hr className="h-px border-0 bg-linear-to-r from-transparent from-25% via-white/50 to-75% to-transparent" />
      <div className="container py-7">
        <p className="text-base text-text">
          &copy; {new Date().getFullYear()} {content.copyrightHolder}. All rights reserved.
        </p>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 -z-10 size-280 -translate-x-1/2 translate-y-1/2 blur-2xl"
        style={{
          background: 'radial-gradient(circle, color-mix(in srgb, var(--color-primary) 30%, transparent) 0%, transparent 80%)',
        }}
      />
    </footer>
  );
}
