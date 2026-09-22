'use client';

import { useState } from 'react';
import { BookOpen, FileText, Plus, Trash2, X } from 'lucide-react';
import { useBlogPosts, useCmsPages, useCreateCmsPage, useDeleteCmsPage, usePublishCmsPage } from '@/lib/queries/cms';
import { useCurrentStore } from '@/lib/queries/stores';

export default function CmsManagementPage() {
  const { store } = useCurrentStore();
  const { data: pages, isLoading: loadingPages } = useCmsPages(store?.id);
  const { data: blogPosts } = useBlogPosts(store?.id);
  const createPage = useCreateCmsPage();
  const publishPage = usePublishCmsPage();
  const deletePage = useDeleteCmsPage();

  const [activeTab, setActiveTab] = useState<'pages' | 'blog'>('pages');
  const [modalOpen, setModalOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createPage.mutateAsync({
        title,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        body,
        storeId: store?.id,
      });
      setModalOpen(false);
      setTitle('');
      setSlug('');
      setBody('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create page');
    }
  };

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">CMS & Content Management</h1>
          <p className="text-sm text-slate-500">
            Publish custom store pages, terms of service, policies, and articles for your audience
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="size-4" /> Create New Page
        </button>
      </div>

      <div className="border-b border-slate-200">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('pages')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'pages'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Custom Pages ({pages?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('blog')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'blog'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Blog Articles ({blogPosts?.length ?? 0})
          </button>
        </div>
      </div>

      {activeTab === 'pages' && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          {loadingPages ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading pages...</div>
          ) : !pages || pages.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="mx-auto size-8 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-700">No CMS pages created yet</p>
              <p className="text-xs text-slate-400 mt-1">Create pages like About Us, Terms & Conditions, Shipping Policy, or FAQs.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/75 text-slate-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Page Title</th>
                    <th className="px-5 py-3 font-semibold">URL Path</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Published</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pages.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{p.title}</td>
                      <td className="px-5 py-3.5 font-mono text-slate-500">/pages/{p.slug}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            p.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                        {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : 'Draft'}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        {p.status !== 'PUBLISHED' && (
                          <button
                            type="button"
                            onClick={() => publishPage.mutate(p.id)}
                            disabled={publishPage.isPending}
                            className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            Publish
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deletePage.mutate(p.id)}
                          disabled={deletePage.isPending}
                          className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'blog' && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-6 text-center">
          <BookOpen className="mx-auto size-8 text-slate-300 mb-2" />
          <p className="text-sm font-medium text-slate-700">No blog articles published</p>
          <p className="text-xs text-slate-400 mt-1">Share brand updates, styling tips, or company news with your customers.</p>
        </div>
      )}

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Create New CMS Page</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>
            {error && <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700 mb-4">{error}</div>}
            <form onSubmit={handleCreatePage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Page Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                  }}
                  required
                  placeholder="e.g. Privacy Policy & GDPR"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">URL Slug *</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  placeholder="privacy-policy"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Page Content (HTML/Markdown) *</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  rows={6}
                  placeholder="Enter the contents of the page here..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none font-sans"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={createPage.isPending} className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Create Page</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
