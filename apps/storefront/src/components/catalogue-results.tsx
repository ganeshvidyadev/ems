'use client';

import { useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CatalogueToolbar } from './catalogue-toolbar';
import { CatalogueSkeleton } from './catalogue-skeleton';

/** Keep the initial catalog in the document rather than a route-level streamed
 * loading boundary. Client search/sort navigation still gets a real pending UI.
 */
export function CatalogueResults({ q, sort, children }: { q: string; sort: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section className="space-y-6" aria-label="Product results" aria-busy={pending}>
      <CatalogueToolbar q={q} sort={sort} onNavigate={(href) => startTransition(() => router.push(href))} />
      {pending ? <CatalogueSkeleton /> : children}
    </section>
  );
}
