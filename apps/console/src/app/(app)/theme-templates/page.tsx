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
import { formatMoney } from '@/lib/utils';
import {
  useArchiveThemeTemplate,
  useDeleteThemeTemplate,
  usePlatformThemeTemplates,
} from '@/lib/queries/platform-theme-templates';

export default function ThemeTemplatesPage() {
  const canCreate = usePermission('platform.template:create');
  const canUpdate = usePermission('platform.template:update');
  const canDelete = usePermission('platform.template:delete');

  const templates = usePlatformThemeTemplates();
  const archive = useArchiveThemeTemplate();
  const remove = useDeleteThemeTemplate();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Theme templates</h1>
          <p className="text-sm text-muted-foreground">The gallery every merchant picks a storefront design from.</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/theme-templates/new">New template</Link>
          </Button>
        )}
      </div>

      {templates.isError && <Alert variant="error">Could not load templates. Try refreshing the page.</Alert>}
      {archive.isError && <Alert variant="error">Could not archive that template.</Alert>}
      {remove.isError && <Alert variant="error">Could not delete that template.</Alert>}

      {templates.data && templates.data.length === 0 && (
        <EmptyState title="No templates yet" description="Add the first one to populate the gallery." />
      )}

      {templates.data && templates.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Pricing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>In use</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.data.map((t) => (
              <TableRow key={t.code}>
                <TableCell>
                  <p className="font-medium">{t.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{t.code}</p>
                </TableCell>
                <TableCell className="capitalize">{t.category}</TableCell>
                <TableCell className="tabular">
                  {t.isPremium ? (
                    <>
                      {formatMoney({ amountMinor: t.priceMinor, currency: 'INR' })}
                      {t.minPlanCode && (
                        <span className="ml-1 text-xs text-muted-foreground">({t.minPlanCode}+)</span>
                      )}
                    </>
                  ) : (
                    'Free'
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={t.status === 'ACTIVE' ? 'success' : 'default'}>{t.status}</Badge>
                </TableCell>
                <TableCell className="tabular">{t.usageCount}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {canUpdate && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/theme-templates/${t.code}`}>Edit</Link>
                      </Button>
                    )}
                    {canUpdate && t.status === 'ACTIVE' && (
                      <Button size="sm" variant="outline" loading={archive.isPending} onClick={() => archive.mutate(t.code)}>
                        Archive
                      </Button>
                    )}
                    {canDelete && t.usageCount === 0 && (
                      <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(t.code)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {templates.data.length === 0 && <TableEmptyRow colSpan={6}>No templates.</TableEmptyRow>}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this template?"
        description="This cannot be undone. Only templates no store has selected can be deleted."
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
