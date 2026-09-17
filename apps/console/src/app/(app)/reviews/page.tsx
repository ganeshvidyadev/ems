'use client';

import { useState } from 'react';
import { Check, MessageSquare, Star, X } from 'lucide-react';
import { useModerateReview, useReplyToReview, useReviews } from '@/lib/queries/reviews';

export default function ReviewsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data: reviews } = useReviews(statusFilter === 'all' ? undefined : statusFilter);
  const moderateReview = useModerateReview();
  const replyReview = useReplyToReview();

  const [replyModalId, setReplyModalId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyModalId || !replyText.trim()) return;
    try {
      await replyReview.mutateAsync({ id: replyModalId, reply: replyText });
      setReplyModalId(null);
      setReplyText('');
    } catch (err) {
      console.error(err);
    }
  };

  const sampleReviews = [
    {
      id: 'rev_1',
      productId: 'prod_1',
      customerName: 'Aarav Mehta',
      rating: 5,
      title: 'Exceptional quality fabric!',
      body: 'The fit and stitching on this linen shirt exceeded my expectations. Will order again in navy.',
      status: 'APPROVED' as const,
      merchantReply: 'Thank you for your warm words Aarav! Glad you loved the linen craftsmanship.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'rev_2',
      productId: 'prod_2',
      customerName: 'Priya Verma',
      rating: 4,
      title: 'Great design, fast delivery',
      body: 'Delivered in 2 days to Bangalore. The packaging was immaculate.',
      status: 'PENDING' as const,
      merchantReply: null,
      createdAt: new Date().toISOString(),
    },
  ];

  const displayReviews = reviews?.length ? reviews : sampleReviews;

  return (
    <div className="space-y-6">
      <div className="mantis-page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Product Reviews & Ratings</h1>
          <p className="text-sm text-slate-500">
            Moderate verified customer feedback, manage star ratings, and reply publicly to reviews
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {['all', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s === 'all' ? 'All Reviews' : s}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Star className="size-4 text-amber-500 fill-amber-500" /> Customer Ratings & Testimonials
          </h2>
          <span className="text-xs text-slate-500">{displayReviews.length} reviews</span>
        </div>

        <div className="divide-y divide-slate-100">
          {displayReviews.map((r) => (
            <div key={r.id} className="p-5 hover:bg-slate-50/50 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex items-center text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`size-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                        />
                      ))}
                    </div>
                    <span className="font-bold text-slate-900 text-xs">{r.title}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    By <strong>{r.customerName ?? 'Verified Buyer'}</strong> · {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    r.status === 'APPROVED'
                      ? 'bg-emerald-50 text-emerald-700'
                      : r.status === 'PENDING'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {r.status}
                </span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed">{r.body}</p>

              {r.merchantReply && (
                <div className="rounded-md border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-900 ml-4">
                  <span className="font-bold block mb-1">Your Official Response:</span>
                  <p>{r.merchantReply}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <div className="space-x-2">
                  {r.status === 'PENDING' && (
                    <>
                      <button
                        type="button"
                        onClick={() => moderateReview.mutate({ id: r.id, status: 'APPROVED' })}
                        className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        <Check className="size-3.5" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => moderateReview.mutate({ id: r.id, status: 'REJECTED' })}
                        className="inline-flex items-center gap-1 font-semibold text-rose-600 hover:text-rose-700"
                      >
                        <X className="size-3.5" /> Reject
                      </button>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setReplyModalId(r.id);
                    setReplyText(r.merchantReply ?? '');
                  }}
                  className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline"
                >
                  <MessageSquare className="size-3" /> {r.merchantReply ? 'Edit Reply' : 'Reply Publicly'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reply Modal */}
      {replyModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Reply to Review</h3>
              <button type="button" onClick={() => setReplyModalId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={handleSendReply} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Your Official Merchant Response *</label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  required
                  rows={4}
                  placeholder="Thank the customer or address their concern constructively..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setReplyModalId(null)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={replyReview.isPending} className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Publish Reply</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
