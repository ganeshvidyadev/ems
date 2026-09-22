'use client';

import { useState } from 'react';
import { CheckCircle2, Copy, Download, Globe, HelpCircle, Lock, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { generateCsvText, downloadCsvFile } from '@/lib/csv-helper';
import { useAddDomain, useDeleteDomain, useDomains, useVerifyDomain } from '@/lib/queries/domains';

export default function DomainsPage() {
  const { data: domains, isLoading } = useDomains();
  const addDomain = useAddDomain();
  const verifyDomain = useVerifyDomain('');
  const deleteDomain = useDeleteDomain();

  const [modalOpen, setModalOpen] = useState(false);
  const [hostname, setHostname] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExportDomainsCsv = () => {
    if (!domains || domains.length === 0) return;
    const headers = ['Domain ID', 'Hostname', 'Is Primary', 'Verification Status', 'SSL Status'];
    const rows = domains.map((d) => [
      d.id,
      d.hostname,
      d.isPrimary ? 'Yes' : 'No',
      d.verifiedAt ? 'VERIFIED' : 'PENDING',
      d.sslStatus ?? 'ACTIVE',
    ]);
    downloadCsvFile(generateCsvText(headers, rows), `custom-domains-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await addDomain.mutateAsync({ hostname });
      setModalOpen(false);
      setHostname('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add custom domain');
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await verifyDomain.mutateAsync();
    } catch (err) {
      console.error(err);
    } finally {
      setVerifyingId(null);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Custom Domains</h1>
          <p className="text-sm text-slate-500">
            Connect your own branded domain to your online store with automated free SSL
          </p>
        </div>
        <div className="flex items-center gap-2">
          {domains && domains.length > 0 && (
            <button
              type="button"
              onClick={handleExportDomainsCsv}
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
            <Plus className="size-4" /> Add Custom Domain
          </button>
        </div>
      </div>

      {/* Domains Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Globe className="size-4 text-blue-600" /> Connected & Configured Domains
          </h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading domains...</div>
        ) : !domains || domains.length === 0 ? (
          <div className="p-8 text-center">
            <Globe className="mx-auto size-8 text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No custom domains connected</p>
            <p className="text-xs text-slate-400 mt-1">Connect a domain like store.yourbrand.com to establish your brand.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
                <tr>
                  <th className="px-5 py-3 font-semibold">Domain Name</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">Verification</th>
                  <th className="px-5 py-3 font-semibold">SSL Certificate</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {domains.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{d.hostname}</span>
                        {d.isPrimary && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                            PRIMARY
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 font-medium">
                      {d.type}
                    </td>
                    <td className="px-5 py-3.5">
                      {d.isVerified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="size-3" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          Pending DNS
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                        <Lock className="size-3 text-emerald-600" /> {d.sslStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      {!d.isVerified && (
                        <button
                          type="button"
                          onClick={() => handleVerify(d.id)}
                          disabled={verifyingId === d.id}
                          className="inline-flex items-center gap-1 rounded border border-blue-200 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <RefreshCw className={`size-3 ${verifyingId === d.id ? 'animate-spin' : ''}`} />
                          Verify DNS
                        </button>
                      )}
                      {!d.isPrimary && (
                        <button
                          type="button"
                          onClick={() => deleteDomain.mutate(d.id)}
                          disabled={deleteDomain.isPending}
                          className="inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="size-3" /> Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DNS Setup Guide Card */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-2">
          <HelpCircle className="size-4 text-blue-600" /> How to connect your custom domain
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Log in to your DNS provider (e.g. GoDaddy, Cloudflare, Namecheap) and add the following records:
        </p>

        <div className="space-y-3 font-mono text-xs">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Type: CNAME</span>
              <span className="font-semibold text-slate-800">Host: store (or @) → Value: cname.ems.localhost</span>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard('cname.ems.localhost', 'cname')}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-sans font-medium text-slate-700 hover:bg-slate-50"
            >
              <Copy className="size-3" /> {copied === 'cname' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Add Domain Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Add Custom Domain</h3>
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

            <form onSubmit={handleAddDomain} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Domain Hostname *</label>
                <input
                  type="text"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  required
                  placeholder="e.g. shop.yourbrand.com"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none font-mono"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Do not include http:// or https://. Example: store.mybrand.com
                </span>
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
                  disabled={addDomain.isPending}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {addDomain.isPending ? 'Adding...' : 'Add Domain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
