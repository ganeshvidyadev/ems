'use client';

import Link from 'next/link';

export default function StorefrontError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="mx-auto max-w-lg rounded-theme border border-line bg-surface p-8 text-center">
      <h1 className="font-heading text-2xl font-semibold text-ink">We couldn’t load this page</h1>
      <p className="mt-3 text-sm text-ink-muted">Please try again in a moment. Your cart will still be here.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-theme bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Try again</button>
        <Link href="/" className="rounded-theme border border-line px-5 py-3 text-sm font-semibold text-ink">Back to shop</Link>
      </div>
    </section>
  );
}
