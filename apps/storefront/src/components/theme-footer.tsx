import Link from 'next/link';
import type { StorefrontTheme } from '@/lib/theme';

export function ThemeFooter({
  theme,
  name,
  currency,
}: {
  theme: StorefrontTheme;
  name: string;
  currency: string;
}) {
  return (
    <footer className="theme-footer">
      <div className="theme-container theme-footer-grid">
        <div>
          <Link href="/" className="theme-logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>, not
                next/image, matches site-header.tsx's own theme-logo usage. */}
            <img
              src={
                theme === 'organic'
                  ? '/themes/organic/images/logo.svg'
                  : '/themes/famms/images/logo.png'
              }
              alt={theme === 'organic' ? 'Organic' : 'Famms'}
              width={210}
              height={60}
            />
          </Link>
          <p className="theme-footer-company">{name}</p>
          <p>Your everyday shopping, all in one place.</p>
        </div>
        <div>
          <h2>Shop</h2>
          <Link href="/">Home</Link>
          <Link href="/products">All products</Link>
          <Link href="/products?sort=-totalSold">Popular products</Link>
        </div>
        <div>
          <h2>Your shopping</h2>
          <Link href="/cart">Shopping bag</Link>
          <Link href="/products">Continue shopping</Link>
          <p>All prices in {currency}.</p>
        </div>
      </div>
      <div className="theme-container theme-copyright">
        <p>
          © {new Date().getFullYear()} {name}.
        </p>
        <p>
          Design by{' '}
          {theme === 'organic' ? (
            <a href="https://templatesjungle.com/">TemplatesJungle</a>
          ) : (
            <a href="https://html.design/">Free HTML Templates</a>
          )}
        </p>
      </div>
    </footer>
  );
}
