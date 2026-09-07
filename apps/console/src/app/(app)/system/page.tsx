'use client';

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * Platform status — the infrastructure smoke test.
 *
 * This was the console's landing page through Phase 1, where "did the whole chain come
 * up?" was the most useful thing a page could answer. It is kept verbatim rather than
 * deleted, because loading it still verifies Next.js → API → MySQL, Redis and MongoDB in
 * one request, which no amount of business UI does. It simply no longer earns the
 * landing slot: a merchant signing in wants their orders, not a latency table.
 *
 * Health endpoints are read with bare axios rather than the `apiGet` helper: they are
 * unversioned infrastructure routes that return raw JSON, deliberately outside the
 * `/api/v1` response envelope (see HealthController).
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

export default function SystemStatusPage() {
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
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">System status</h1>
        <p className="text-sm text-muted-foreground">
          Live infrastructure health. Loading this page exercises the API and every backing
          store it depends on.
        </p>
      </header>

      <div className="space-y-4">
        <Card variant="elevated">
          <CardHeader
            as="h2"
            title="Dependencies"
            action={
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {ready.isFetching ? 'checking…' : 'refreshes every 10s'}
              </span>
            }
          />
          <CardBody>
            {ready.isError && (
              <p className="text-sm text-destructive">
                Cannot reach the API at <code className="font-mono">{API_ORIGIN}</code>. Start it
                with <code className="font-mono">pnpm dev:api</code>.
              </p>
            )}

            {ready.data && (
              <ul className="divide-y">
                {Object.entries(ready.data.dependencies).map(([name, dependency]) => (
                  <li key={name} className="flex items-center justify-between py-3 first:pt-0">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          dependency.status === 'up' ? 'bg-success' : 'bg-destructive',
                        )}
                        aria-hidden
                      />
                      <span className="font-mono text-sm">{name}</span>
                      {/* The dot is colour-only; this is the same fact in text. */}
                      <span className="sr-only">{dependency.status}</span>
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
          </CardBody>
        </Card>

        <Card variant="elevated">
          <CardHeader as="h2" title="Schema" />
          <CardBody>
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
          </CardBody>
        </Card>
      </div>

      <footer className="mt-6 text-xs text-muted-foreground">
        <a className="underline hover:text-foreground" href={`${API_ORIGIN}/api/docs`}>
          API reference (Swagger)
        </a>
      </footer>
    </main>
  );
}
