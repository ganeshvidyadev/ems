'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { cn } from '@/lib/utils';

/**
 * Phase 1 landing page: live platform status.
 *
 * A placeholder "Welcome" screen would prove nothing. This calls the real health
 * endpoints, so loading it verifies the whole chain — Next.js → API → MySQL, Redis
 * and MongoDB — and it stays useful as a smoke test once the dashboard lands here
 * in Phase 3.
 *
 * Health endpoints are read with bare axios rather than the `apiGet` helper: they
 * are unversioned infrastructure routes that return raw JSON, deliberately outside
 * the `/api/v1` response envelope (see HealthController).
 */

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(
  /\/api\/v\d+\/?$/,
  '',
);

interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

interface ReadyResponse {
  status: string;
  dependencies: Record<string, DependencyStatus>;
  timestamp: string;
}

export default function StatusPage() {
  const ready = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: async () => {
      const response = await axios.get<ReadyResponse>(`${API_ORIGIN}/health/ready`, {
        // A degraded API answers 503 with a useful body; throwing on it would
        // discard exactly the information this page exists to show.
        validateStatus: (status) => status === 200 || status === 503,
      });
      return response.data;
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const startup = useQuery({
    queryKey: ['health', 'startup'],
    queryFn: async () => {
      const response = await axios.get<{ status: string; migrations?: string }>(
        `${API_ORIGIN}/health/startup`,
        { validateStatus: (status) => status === 200 || status === 503 },
      );
      return response.data;
    },
    retry: false,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 p-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          EMS Console
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Platform status</h1>
        <p className="text-muted-foreground">
          Phase 1 foundation. Authentication and the merchant dashboard arrive in Phases 2–3.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-medium">Dependencies</h2>
          <span className="text-xs text-muted-foreground">
            {ready.isFetching ? 'checking…' : 'refreshes every 10s'}
          </span>
        </div>

        {ready.isError && (
          <p className="text-sm text-destructive">
            Cannot reach the API at <code className="font-mono">{API_ORIGIN}</code>. Start it with{' '}
            <code className="font-mono">pnpm dev:api</code>.
          </p>
        )}

        {ready.data && (
          <ul className="divide-y">
            {Object.entries(ready.data.dependencies).map(([name, dependency]) => (
              <li key={name} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      dependency.status === 'up' ? 'bg-success' : 'bg-destructive',
                    )}
                    aria-hidden
                  />
                  <span className="font-mono text-sm">{name}</span>
                </div>
                <span className="tabular text-sm text-muted-foreground">
                  {dependency.status === 'up'
                    ? `${dependency.latencyMs ?? 0} ms`
                    : (dependency.error ?? 'down')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 font-medium">Schema</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Migrations</span>
          <span
            className={cn(
              'font-mono',
              startup.data?.status === 'ok' ? 'text-success' : 'text-destructive',
            )}
          >
            {startup.isLoading
              ? '…'
              : startup.data?.status === 'ok'
                ? (startup.data.migrations ?? 'up-to-date')
                : 'pending — run pnpm db:migrate'}
          </span>
        </div>
      </section>

      <footer className="text-xs text-muted-foreground">
        <a className="underline hover:text-foreground" href={`${API_ORIGIN}/api/docs`}>
          API reference (Swagger)
        </a>
      </footer>
    </main>
  );
}
