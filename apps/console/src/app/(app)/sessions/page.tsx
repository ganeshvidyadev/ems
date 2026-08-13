'use client';

import type { Session } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { apiDelete, apiGet } from '@/lib/api-client';
import { formatRelative } from '@/lib/utils';

/**
 * Active sessions.
 *
 * This page is the only way a user can *notice* a stolen session themselves. Reuse
 * detection catches a replayed refresh token, but an attacker who simply refreshes on
 * schedule is indistinguishable from a second browser. Showing device, IP and last-used
 * turns that into something a person can spot and act on — which is why it ships with
 * auth rather than later.
 */
export default function SessionsPage() {
  const queryClient = useQueryClient();

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiGet<Session[]>('/auth/sessions'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiDelete(`/auth/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Active sessions</h1>
        <p className="text-sm text-muted-foreground">
          Devices currently signed in to your account. Revoke anything you don’t recognise.
        </p>
      </div>

      {sessions.isError && (
        <Alert variant="error">Could not load your sessions. Try refreshing the page.</Alert>
      )}

      <Card>
        <CardHeader title="Signed-in devices" />
        <CardBody className="p-0">
          {sessions.isLoading && (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Loading…</p>
          )}

          {sessions.data && (
            <ul className="divide-y">
              {sessions.data.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">
                      {session.deviceLabel ?? 'Unknown device'}
                      {session.isCurrent && (
                        <span className="ml-2 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{session.ipAddress ?? 'unknown IP'}</span>
                      {' · last used '}
                      {session.lastUsedAt ? formatRelative(session.lastUsedAt) : 'not since sign-in'}
                    </p>
                  </div>

                  <Button
                    variant={session.isCurrent ? 'outline' : 'destructive'}
                    size="sm"
                    loading={revoke.isPending && revoke.variables === session.id}
                    onClick={() => revoke.mutate(session.id)}
                  >
                    {/*
                      Revoking the current device is allowed but labelled differently, so the
                      user understands they are signing themselves out rather than removing
                      someone else.
                    */}
                    {session.isCurrent ? 'Sign out here' : 'Revoke'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-muted-foreground">
        Changing your password signs out every device automatically.
      </p>
    </main>
  );
}
