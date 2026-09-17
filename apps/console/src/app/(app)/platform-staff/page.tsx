'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { usePermission } from '@/hooks/use-auth';
import { formatRelative } from '@/lib/utils';
import {
  useDeletePlatformUser,
  usePlatformUsers,
  useReactivatePlatformUser,
  useSuspendPlatformUser,
} from '@/lib/queries/platform-users';

const STATUS_BADGE: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
  PENDING_VERIFICATION: 'default',
  ACTIVE: 'success',
  SUSPENDED: 'destructive',
  LOCKED: 'warning',
  DEACTIVATED: 'default',
};

const ROLE_LABEL: Record<string, string> = {
  PLATFORM_SUPER_ADMIN: 'Super Admin',
  PLATFORM_SUPPORT: 'Support',
  PLATFORM_BILLING: 'Billing',
};

export default function PlatformStaffPage() {
  const canCreate = usePermission('platform.user:create');
  const canUpdate = usePermission('platform.user:update');
  const canSuspend = usePermission('platform.user:suspend');
  const canDelete = usePermission('platform.user:delete');

  const users = usePlatformUsers();
  const suspend = useSuspendPlatformUser();
  const reactivate = useReactivatePlatformUser();
  const remove = useDeletePlatformUser();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform staff</h1>
          <p className="text-sm text-muted-foreground">Other people with access to this Super Admin panel.</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/platform-staff/new">New staff account</Link>
          </Button>
        )}
      </div>

      {users.isError && <Alert variant="error">Could not load staff accounts. Try refreshing the page.</Alert>}
      {suspend.isError && <Alert variant="error">Could not suspend that account.</Alert>}
      {reactivate.isError && <Alert variant="error">Could not reactivate that account.</Alert>}
      {remove.isError && <Alert variant="error">Could not delete that account.</Alert>}

      {users.data && users.data.length === 0 && (
        <EmptyState title="No staff accounts" description="Add the first one to share access to this panel." />
      )}

      {users.data && users.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.data.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.firstName} {u.lastName ?? ''}
                  {u.isSelf && <Badge variant="default" className="ml-2">You</Badge>}
                </TableCell>
                <TableCell className="text-xs">{u.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} variant="info">
                        {ROLE_LABEL[r] ?? r}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[u.status] ?? 'default'}>{u.status.replace('_', ' ')}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Never'}
                </TableCell>
                <TableCell>
                  {!u.isSelf && (
                    <div className="flex flex-wrap gap-2">
                      {canUpdate && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/platform-staff/${u.id}`}>Edit</Link>
                        </Button>
                      )}
                      {canSuspend && u.status === 'ACTIVE' && (
                        <Button size="sm" variant="outline" loading={suspend.isPending} onClick={() => suspend.mutate(u.id)}>
                          Suspend
                        </Button>
                      )}
                      {canUpdate && u.status === 'SUSPENDED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={reactivate.isPending}
                          onClick={() => reactivate.mutate(u.id)}
                        >
                          Reactivate
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(u.id)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {users.data.length === 0 && <TableEmptyRow colSpan={6}>No staff accounts.</TableEmptyRow>}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this account?"
        description="They lose access to this panel immediately. This cannot be undone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Never mind
          </Button>
          <Button
            variant="destructive"
            loading={remove.isPending}
            onClick={() => {
              if (!deleteTarget) return;
              remove.mutate(deleteTarget, { onSuccess: () => setDeleteTarget(null) });
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </main>
  );
}
