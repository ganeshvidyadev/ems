import type { WebsiteFooterContent } from '@ems/contracts';

export function SiteFooter({ content }: { content: WebsiteFooterContent }) {
  return (
    <footer className="bg-surface-alt">
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500" />
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-ink-muted">
        <div>
          <p>
            &copy; {new Date().getFullYear()} {content.copyrightHolder}. All rights reserved.
          </p>
          {content.tagline && <p className="mt-1">{content.tagline}</p>}
        </div>
        {content.links.length > 0 && (
          <nav className="flex items-center gap-4">
            {content.links.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-fuchsia-600">
                {link.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </footer>
  );
}
