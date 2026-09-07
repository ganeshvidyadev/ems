import type { PaginationMeta } from '@ems/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Prev/next links over a paginated list.
 *
 * Real `<Link href>`s rather than buttons calling `router.push`, so the page
 * number lives in the URL: a shopper can share page 3 of a search, the back
 * button behaves, and the whole thing still works before JavaScript loads.
 *
 * `buildHref` is injected because the surrounding query string differs per page
 * (`q` on search, nothing on the plain listing) and this component has no business
 * knowing which filters exist.
 */
export function Pagination({
  pagination,
  buildHref,
  className,
}: {
  pagination: PaginationMeta;
  buildHref: (page: number) => string;
  className?: string;
}) {
  const { page, totalPages, hasPrev, hasNext } = pagination;

  // One page of results needs no controls at all.
  if (totalPages <= 1) return null;

  return (
    <nav className={cn('flex items-center justify-between gap-4', className)} aria-label="Pagination">
      <PageLink href={buildHref(page - 1)} disabled={!hasPrev} rel="prev">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Previous
      </PageLink>

      <p className="text-sm text-ink-muted" aria-live="polite">
        Page {page} of {totalPages}
      </p>

      <PageLink href={buildHref(page + 1)} disabled={!hasNext} rel="next">
        Next
        <ChevronRight className="h-4 w-4" aria-hidden />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  rel,
  children,
}: {
  href: string;
  disabled: boolean;
  rel: string;
  children: React.ReactNode;
}) {
  const classes =
    'inline-flex h-10 items-center gap-1.5 rounded-theme border border-line px-3 text-sm font-medium transition';

  // A span, not a disabled link: there is no such thing as a disabled anchor, and
  // an `<a>` with no href is still in the tab order and still announced as a link.
  if (disabled) {
    return (
      <span className={cn(classes, 'cursor-not-allowed text-ink-muted opacity-50')} aria-disabled>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      rel={rel}
      className={cn(classes, 'text-ink hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand')}
    >
      {children}
    </Link>
  );
}
