'use client';

import type { SupportTicketResponse, SupportTicketStatus } from '@ems/contracts';
import Link from 'next/link';
import { useState } from 'react';
import {
  Alert,
  Badge,
  EmptyState,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { useSupportTickets } from '@/lib/queries/support-tickets';
import { formatRelative } from '@/lib/utils';

const STATUS_BADGE: Record<SupportTicketStatus, 'default' | 'success' | 'warning' | 'destructive' | 'info'> = {
  OPEN: 'warning',
  PENDING_CUSTOMER: 'default',
  IN_PROGRESS: 'info',
  ESCALATED: 'destructive',
  RESOLVED: 'success',
  CLOSED: 'default',
};

const PRIORITY_BADGE: Record<SupportTicketResponse['priority'], 'default' | 'warning' | 'destructive'> = {
  LOW: 'default',
  NORMAL: 'default',
  HIGH: 'warning',
  URGENT: 'destructive',
};

/**
 * Support ticket queue — every tenant's tickets, for platform staff to triage,
 * assign, and resolve. Tenant users only ever see their own (server-enforced;
 * this page's `mineOnly: false` request is what makes it the platform view).
 */
export default function SupportTicketsPage() {
  const [status, setStatus] = useState<SupportTicketStatus | ''>('');
  const tickets = useSupportTickets(status || undefined);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support tickets</h1>
          <p className="text-sm text-muted-foreground">Every tenant&apos;s tickets, across the platform.</p>
        </div>
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as SupportTicketStatus | '')}
          className="w-auto"
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="PENDING_CUSTOMER">Pending customer</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="ESCALATED">Escalated</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </Select>
      </div>

      {tickets.isError && <Alert variant="error">Could not load tickets. Try refreshing the page.</Alert>}

      {tickets.data && tickets.data.length === 0 && (
        <EmptyState title="No tickets" description="Nothing matches this filter right now." />
      )}

      {tickets.data && tickets.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Raised</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.data.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={`/support/${ticket.id}`} className="hover:underline">
                    {ticket.ticketNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/support/${ticket.id}`} className="font-medium hover:underline">
                    {ticket.subject}
                  </Link>
                  {ticket.isOverdue && (
                    <Badge variant="destructive" className="ml-2">
                      Overdue
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={PRIORITY_BADGE[ticket.priority]}>{ticket.priority}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[ticket.status]}>{ticket.status.replace('_', ' ')}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatRelative(ticket.createdAt)}
                </TableCell>
              </TableRow>
            ))}
            {tickets.data.length === 0 && <TableEmptyRow colSpan={5}>No tickets.</TableEmptyRow>}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
