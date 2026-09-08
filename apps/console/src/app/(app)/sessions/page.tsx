'use client';

import type { Session } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Dialog } from '@/components/ui/primitives';
import { apiDelete, apiGet } from '@/lib/api-client';
import { formatRelative } from '@/lib/utils';

/** Rendered rows are capped rather than paginated — see this page's own note on
 * the `sessions.data` render below (BUG-FE-017). */
const VISIBLE_SESSION_LIMIT = 20;

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
  const [revokeTarget, setRevokeTarget] = useState<Session | null>(null);

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiGet<Session[]>('/auth/sessions'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiDelete(`/auth/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setRevokeTarget(null);
    },
  });

  const visibleSessions = sessions.data?.slice(0, VISIBLE_SESSION_LIMIT) ?? [];
  const hiddenCount = (sessions.data?.length ?? 0) - visibleSessions.length;

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

          {revoke.isError && (
            <Alert variant="error" className="mx-6 mb-4">
              Could not revoke that session. Try again.
            </Alert>
          )}

          {sessions.data && (
            <ul className="divide-y">
              {visibleSessions.map((session) => (
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
                    onClick={() => setRevokeTarget(session)}
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

          {hiddenCount > 0 && (
            <p className="px-6 py-4 text-xs text-muted-foreground">
              Showing the {VISIBLE_SESSION_LIMIT} most recently created of {sessions.data?.length} sessions.
            </p>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={revokeTarget?.isCurrent ? 'Sign out this device?' : 'Revoke this session?'}
        description={
          revokeTarget?.isCurrent
            ? 'You will be signed out of this device immediately.'
            : `"${revokeTarget?.deviceLabel ?? 'This device'}" will be signed out immediately. This cannot be undone.`
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRevokeTarget(null)}>
            Never mind
          </Button>
          <Button
            variant="destructive"
            loading={revoke.isPending}
            onClick={() => {
              if (!revokeTarget) return;
              revoke.mutate(revokeTarget.id);
            }}
          >
            {revokeTarget?.isCurrent ? 'Sign out' : 'Revoke'}
          </Button>
        </div>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Changing your password signs out every device automatically.
      </p>
    </main>
  );
}
