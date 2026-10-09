import Link from 'next/link';
import type { WebsiteHeaderContent } from '@ems/contracts';

/** Ported from Automark's `Header.astro` — pill nav, checkbox-driven mobile menu
 * (the `#nav-toggle`/`#nav-menu`/`#show-button`/`#hide-button` ids are load-bearing:
 * `styles/safe.css` targets them exactly, copied verbatim from the theme). */
export function SiteHeader({ content }: { content: WebsiteHeaderContent }) {
  return (
    <header className="header sticky top-0 z-50 w-full py-6">
      <nav className="navbar container relative z-30">
        <div className="order-0">
          <Link href="/" className="navbar-brand inline-block font-secondary text-xl font-bold text-white">
            {content.logoText}
          </Link>
        </div>

        <input id="nav-toggle" type="checkbox" className="peer hidden" />
        <label
          htmlFor="nav-toggle"
          className="order-3 flex size-12 cursor-pointer items-center justify-center rounded-xl bg-dark/10 text-white backdrop-blur-lg lg:order-1 lg:hidden"
        >
          <svg id="show-button" className="block h-6 fill-current peer-checked:hidden" viewBox="0 0 20 20">
            <title>Menu Open</title>
            <path d="M0 3h20v2H0V3z m0 6h20v2H0V9z m0 6h20v2H0V15z"></path>
          </svg>
          <svg id="hide-button" className="hidden h-6 fill-current peer-checked:block" viewBox="0 0 20 20">
            <title>Menu Close</title>
            <polygon points="11 9 22 9 22 11 11 11 11 22 9 22 9 11 -2 11 -2 9 9 9 9 -2 11 -2" transform="rotate(45 10 10)"></polygon>
          </svg>
        </label>

        <ul
          id="nav-menu"
          className="navbar-nav order-3 hidden w-full rounded-2xl bg-light/90 px-6 py-6 max-lg:mt-5 peer-checked:flex peer-checked:flex-col lg:order-1 lg:flex lg:w-auto lg:gap-x-2 lg:rounded-full lg:bg-dark/30 lg:py-0 lg:backdrop-blur-lg xl:gap-x-8"
        >
          {content.navLinks.map((link) => (
            <li key={link.href} className="nav-item">
              <a href={link.href} className="nav-link block">
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="order-1 ml-auto flex items-center lg:ml-0">
          <a href={content.ctaHref} className="btn btn-primary hidden lg:inline-block">
            {content.ctaLabel}
          </a>
        </div>
      </nav>
    </header>
  );
}
