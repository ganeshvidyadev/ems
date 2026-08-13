import { Suspense, type ReactNode } from 'react';

/**
 * Shell for unauthenticated pages.
 *
 * Deliberately does **not** gate on auth state — these are the pages a signed-out user
 * needs. The `(app)` group does the gating, so the two never fight over a redirect.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            EMS Console
          </p>
        </div>
        {/*
          Suspense boundary for `useSearchParams()`.
          Every page in this group reads a token or `next` path from the query string, and
          Next.js requires a boundary above any client component that does so — otherwise
          prerendering fails rather than falling back to client rendering. Placing it in the
          layout covers all of them with one shared fallback.
        */}
        <Suspense fallback={<AuthFallback />}>{children}</Suspense>
      </div>
    </div>
  );
}

function AuthFallback() {
  return (
    <div className="flex items-center justify-center rounded-lg border bg-card py-16 shadow-sm">
      <span
        className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
        aria-hidden
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}
