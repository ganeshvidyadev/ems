'use client';

import type { SupportTicketStatus } from '@ems/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Textarea,
} from '@/components/ui/primitives';
import { useAuth, usePermission } from '@/hooks/use-auth';
import { formatRelative } from '@/lib/utils';
import {
  useAddSupportTicketMessage,
  useAssignSupportTicket,
  useCloseSupportTicket,
  useResolveSupportTicket,
  useSupportTicket,
  useSupportTicketMessages,
} from '@/lib/queries/support-tickets';

const STATUS_BADGE: Record<SupportTicketStatus, 'default' | 'success' | 'warning' | 'destructive' | 'info'> = {
  OPEN: 'warning',
  PENDING_CUSTOMER: 'default',
  IN_PROGRESS: 'info',
  ESCALATED: 'destructive',
  RESOLVED: 'success',
  CLOSED: 'default',
};

export default function SupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const canAssign = usePermission('platform.support:assign');
  const canUpdate = usePermission('platform.support:update');
  const canClose = usePermission('platform.support:close');

  const ticket = useSupportTicket(params.id);
  const messages = useSupportTicketMessages(params.id);
  const addMessage = useAddSupportTicketMessage(params.id);
  const assign = useAssignSupportTicket(params.id);
  const resolve = useResolveSupportTicket(params.id);
  const close = useCloseSupportTicket(params.id);

  const [reply, setReply] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);

  if (ticket.isError) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Alert variant="error">Could not load this ticket.</Alert>
      </main>
    );
  }
  if (!ticket.data) {
    return <main className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Loading…</main>;
  }

  const t = ticket.data;
  // Only CLOSED is actually terminal — `close()` accepts a ticket from any
  // prior status (including RESOLVED), so hiding the close action once
  // resolved would leave no way to ever close it.
  const isTerminal = t.status === 'CLOSED';

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link href="/support" className="text-sm text-muted-foreground hover:underline">
          &larr; Support tickets
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t.subject}</h1>
          <Badge variant={STATUS_BADGE[t.status]}>{t.status.replace('_', ' ')}</Badge>
          {t.isOverdue && <Badge variant="destructive">Overdue</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.ticketNumber} · {t.category ?? 'Uncategorised'} · {t.priority} priority · raised{' '}
          {formatRelative(t.createdAt)}
          {/*
            `assignedTo` is the internal staff-user id, not a public one — there is
            no staff directory yet to resolve it to a name (see `platform.user`,
            unimplemented), so this only says whether it's assigned, not to whom.
          */}
          {t.assignedTo && ' · assigned'}
        </p>
      </div>

      {!isTerminal && (canAssign || canUpdate || canClose) && (
        <div className="flex flex-wrap gap-2">
          {canAssign && !t.assignedTo && (
            <Button
              size="sm"
              variant="outline"
              loading={assign.isPending}
              onClick={() => user && assign.mutate(user.id)}
            >
              Assign to me
            </Button>
          )}
          {canUpdate && t.status !== 'RESOLVED' && (
            <Button size="sm" variant="outline" loading={resolve.isPending} onClick={() => resolve.mutate()}>
              Mark resolved
            </Button>
          )}
          {canClose && (
            <Button size="sm" variant="outline" loading={close.isPending} onClick={() => close.mutate()}>
              Close ticket
            </Button>
          )}
        </div>
      )}

      {(assign.isError || resolve.isError || close.isError) && (
        <Alert variant="error">That action didn&apos;t go through. Try again.</Alert>
      )}

      <Card>
        <CardHeader title="Conversation" />
        <CardBody className="space-y-4">
          {messages.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {messages.data && messages.data.length === 0 && (
            <EmptyState title="No messages yet" description="The original ticket body starts the thread below." />
          )}
          {messages.data?.map((m) => (
            <div
              key={m.id}
              className={`rounded-md border p-3 text-sm ${m.isInternalNote ? 'border-warning/40 bg-warning/10' : ''}`}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">
                  {m.authorType === 'REQUESTER' ? 'Requester' : m.authorType === 'AGENT' ? 'Staff' : 'System'}
                </span>
                {m.isInternalNote ? <Badge variant="warning">Internal note</Badge> : null}
                <span>· {formatRelative(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}

          {!isTerminal && (
            <form
              className="space-y-3 border-t pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reply.trim()) return;
                addMessage.mutate(
                  { body: reply.trim(), isInternalNote },
                  { onSuccess: () => setReply('') },
                );
              }}
            >
              <Textarea
                placeholder={isInternalNote ? 'Internal note (not visible to the tenant)…' : 'Reply to the tenant…'}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              {addMessage.isError && <Alert variant="error">Could not send that message.</Alert>}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                  />
                  Internal note (staff only)
                </label>
                <Button type="submit" size="sm" loading={addMessage.isPending} disabled={!reply.trim()}>
                  Send
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
