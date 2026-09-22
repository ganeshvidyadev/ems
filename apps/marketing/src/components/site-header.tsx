import Link from 'next/link';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#plans', label: 'Plans' },
];

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-content items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-amber-500 bg-clip-text text-lg font-bold tracking-tight text-transparent"
        >
          EMS
        </Link>
        <nav className="flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-ink-muted hover:text-fuchsia-600">
              {link.label}
            </a>
          ))}
          <a
            href="mailto:hello@ems.app"
            className="rounded-md bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:from-indigo-500 hover:to-fuchsia-500"
          >
            Get in touch
          </a>
        </nav>
      </div>
    </header>
  );
}
