import Link from 'next/link';

/**
 * A server component: nothing here changes after render, so there is no reason to
 * send it to the browser as JavaScript.
 */
export function SiteFooter({ name, currency }: { name: string; currency: string }) {
  return (
    <footer className="mt-16 border-t border-line bg-surface-alt">
      <div className="mx-auto flex max-w-content flex-col gap-4 px-4 py-8 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-heading font-semibold text-ink">{name}</p>
          <p>
            &copy; {new Date().getFullYear()} {name}. All prices in {currency}.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/products" className="hover:text-ink">
            All products
          </Link>
          <Link href="/cart" className="hover:text-ink">
            Cart
          </Link>
        </nav>
      </div>
    </footer>
  );
}
