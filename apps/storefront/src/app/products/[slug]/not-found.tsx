import { PackageX } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui';

/**
 * Shown when `notFound()` fires on the product page — which covers a bad slug, a
 * product the merchant has archived, and one set to hidden. A shopper does not
 * need those distinguished, and distinguishing them would tell an unauthenticated
 * visitor which slugs exist.
 */
export default function ProductNotFound() {
  return (
    <div className="py-8">
      <EmptyState
        icon={<PackageX className="h-8 w-8" />}
        title="We could not find that product"
        description="It may have sold out or been removed from the shop."
        action={
          <Link
            href="/products"
            className="inline-flex h-10 items-center rounded-theme bg-brand px-4 text-sm font-medium text-brand-foreground hover:opacity-90"
          >
            Browse all products
          </Link>
        }
      />
    </div>
  );
}
