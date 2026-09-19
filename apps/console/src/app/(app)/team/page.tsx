'use client';

import { useState } from 'react';
import { Download, RotateCw, Trash2, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { generateCsvText, downloadCsvFile } from '@/lib/csv-helper';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useCreateInvitation, useInvitations, useResendInvitation, useRevokeInvitation } from '@/lib/queries/team';

export default function TeamPage() {
  const { user } = useAuth();
  const { data: invitations, isLoading } = useInvitations();
  const createInvitation = useCreateInvitation();
  const resendInvitation = useResendInvitation();
  const revokeInvitation = useRevokeInvitation();

  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('TENANT_ADMIN');
  const [error, setError] = useState<string | null>(null);

  const handleExportTeamCsv = () => {
    if (!invitations || invitations.length === 0) return;
    const headers = ['Invitation ID', 'Email', 'Name', 'Roles', 'Status', 'Expires At', 'Created At'];
    const rows = invitations.map((inv) => [
      inv.id,
      inv.email,
      [inv.firstName, inv.lastName].filter(Boolean).join(' ') || '—',
      (inv.roles ?? []).join('; '),
      inv.status,
      inv.expiresAt ? formatDate(inv.expiresAt) : '',
      formatDate(inv.createdAt),
    ]);
    downloadCsvFile(generateCsvText(headers, rows), `team-invitations-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createInvitation.mutateAsync({
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        roleCodes: [role],
      });
      setModalOpen(false);
      setEmail('');
      setFirstName('');
      setLastName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team & Staff</h1>
          <p className="text-sm text-slate-500">
            Invite colleagues to help manage products, orders, fulfillment, and customer support
          </p>
        </div>
        <div className="flex items-center gap-2">
          {invitations && invitations.length > 0 && (
            <button
              type="button"
              onClick={handleExportTeamCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="size-4" /> Export CSV
            </button>
          )}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <UserPlus className="size-4" /> Invite Staff Member
          </button>
        </div>
      </div>

      {/* Current User Card */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Store Owner / Primary Account</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm">
              {user?.firstName?.[0] ?? 'O'}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{user?.firstName} {user?.lastName ?? ''}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            Owner (Full Access)
          </span>
        </div>
      </div>

      {/* Staff Invitations Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Users className="size-4 text-blue-600" /> Invited Team Members & Invitations
          </h2>
          <span className="text-xs text-slate-500">{invitations?.length ?? 0} total</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading invitations...</div>
        ) : !invitations || invitations.length === 0 ? (
          <div className="p-8 text-center">
            <UserCheck className="mx-auto size-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No additional staff members yet</p>
            <p className="text-xs text-slate-400 mt-1">Invite team members to collaborate on your store.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
                <tr>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Assigned Roles</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Expires</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-900">{inv.firstName ? `${inv.firstName} ${inv.lastName ?? ''}` : inv.email}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{inv.email}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {inv.roles.join(', ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          inv.status === 'ACCEPTED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : inv.status === 'PENDING'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      {inv.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            onClick={() => resendInvitation.mutate(inv.id)}
                            disabled={resendInvitation.isPending}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <RotateCw className="size-3" /> Resend
                          </button>
                          <button
                            type="button"
                            onClick={() => revokeInvitation.mutate(inv.id)}
                            disabled={revokeInvitation.isPending}
                            className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="size-3" /> Revoke
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Invite Staff Member</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            {error && (
              <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="colleague@store.com"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Rahul"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Sharma"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role & Permissions *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="TENANT_ADMIN">Store Administrator (Full store control)</option>
                  <option value="ORDER_MANAGER">Order Manager (Manage orders, returns & fulfillment)</option>
                  <option value="CATALOG_MANAGER">Catalog Manager (Manage products, inventory & categories)</option>
                  <option value="SUPPORT_AGENT">Customer Support (View orders & handle support)</option>
                </select>
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
                  disabled={createInvitation.isPending}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createInvitation.isPending ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
