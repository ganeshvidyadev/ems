'use client';

import { useState } from 'react';
import {
  HelpCircle,
  LifeBuoy,
  MessageSquare,
  Plus,
  Send,
  X,
} from 'lucide-react';
import {
  useAddSupportTicketMessage,
  useCreateSupportTicket,
  useSupportTicket,
  useSupportTicketMessages,
  useSupportTickets,
} from '@/lib/queries/support-tickets';

type TicketCategory = 'TECHNICAL' | 'BILLING' | 'DOMAIN' | 'SHIPPING' | 'OTHER';
type TicketPriority = 'NORMAL' | 'LOW' | 'HIGH' | 'URGENT';

export default function TenantSupportTicketsPage() {
  const { data: tickets, isLoading } = useSupportTickets();
  const createTicket = useCreateSupportTicket();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Form states
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('TECHNICAL');
  const [priority, setPriority] = useState<TicketPriority>('NORMAL');
  const [body, setBody] = useState('');
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: activeTicket } = useSupportTicket(selectedTicketId ?? undefined);
  const { data: messages, isLoading: loadingMessages } = useSupportTicketMessages(selectedTicketId ?? undefined);
  const addMessage = useAddSupportTicketMessage(selectedTicketId ?? '');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createTicket.mutateAsync({
        subject,
        category,
        priority,
        body,
      });
      setModalOpen(false);
      setSubject('');
      setBody('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create support ticket');
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicketId) return;
    try {
      await addMessage.mutateAsync({ body: replyText, isInternalNote: false });
      setReplyText('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Help & Support</h1>
          <p className="text-sm text-slate-500">
            Submit questions, report technical issues, or request assistance from the EMS engineering team
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="size-4" /> Create Support Ticket
        </button>
      </div>

      {/* Tickets List */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <LifeBuoy className="size-4 text-blue-600" /> Your Support Inquiries
          </h2>
          <span className="text-xs text-slate-500">{tickets?.length ?? 0} total</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading tickets...</div>
        ) : !tickets || tickets.length === 0 ? (
          <div className="p-8 text-center">
            <HelpCircle className="mx-auto size-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No support tickets opened</p>
            <p className="text-xs text-slate-400 mt-1">If you have any questions or bugs to report, open a ticket anytime.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
                <tr>
                  <th className="px-5 py-3 font-semibold">Subject</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 font-semibold">Priority</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 max-w-xs truncate">
                      {t.subject}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {t.category ?? 'GENERAL'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          t.priority === 'URGENT' || t.priority === 'HIGH'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          t.status === 'RESOLVED' || t.status === 'CLOSED'
                            ? 'bg-slate-100 text-slate-600'
                            : t.status === 'OPEN'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedTicketId(t.id)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <MessageSquare className="size-3" /> View Thread
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Thread Modal */}
      {selectedTicketId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{activeTicket?.subject ?? 'Support Ticket'}</h3>
                <span className="text-[11px] text-slate-500 font-mono">ID: {selectedTicketId}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicketId(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingMessages ? (
                <div className="text-center text-xs text-slate-400 py-8">Loading conversation...</div>
              ) : !messages || messages.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-8">No messages in this ticket yet.</div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg p-4 text-xs ${
                      m.authorType === 'AGENT'
                        ? 'border border-blue-200 bg-blue-50/50 mr-8'
                        : 'border border-slate-200 bg-slate-50/75 ml-8'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-200/50 pb-2 mb-2 text-[11px]">
                      <span className="font-semibold text-slate-900">
                        {m.authorType === 'AGENT' ? 'EMS Platform Support' : 'You (Store)'}
                      </span>
                      <span className="text-slate-500">{new Date(m.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-slate-800 leading-relaxed">{m.body}</p>
                  </div>
                ))
              )}
            </div>

            {/* Reply Input Box */}
            <form onSubmit={handleReply} className="border-t border-slate-100 p-4 bg-slate-50 rounded-b-lg">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply to platform support..."
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none bg-white"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || addMessage.isPending}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="size-3.5" /> Reply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Ticket Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Create Support Ticket</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>

            {error && <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 mb-4">{error}</div>}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  placeholder="Brief summary of the issue or inquiry"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TicketCategory)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="TECHNICAL">Technical Issue / Bug</option>
                    <option value="BILLING">Billing & Plans</option>
                    <option value="DOMAIN">Custom Domain / SSL</option>
                    <option value="SHIPPING">Shipping & Carriers</option>
                    <option value="OTHER">General Question</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TicketPriority)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent (Production outage)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Message / Details *</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  rows={5}
                  placeholder="Describe what happened, error messages seen, and steps to reproduce..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTicket.isPending}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createTicket.isPending ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
