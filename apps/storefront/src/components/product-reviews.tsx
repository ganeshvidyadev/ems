'use client';

import type { ReviewResponse } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, MessageSquare, Star, ThumbsUp, Filter, ArrowUpDown } from 'lucide-react';
import { useState, useMemo } from 'react';
import { StarRating } from '@/components/star-rating';
import { Alert, Button, Card, Field, Input, Spinner, Textarea } from '@/components/ui';
import { ApiError, api, type Page } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * Approved reviews for a product, plus the form to add one.
 *
 * Client-side rather than server-rendered because everything here changes without
 * a navigation — a helpful vote, a newly submitted review — and because the
 * initial list is below the fold, so it costs the shopper nothing to fetch it
 * after paint.
 *
 * `ratingAverage`/`ratingCount` come from the product itself and are shown by the
 * page above; only APPROVED reviews count toward them, so those figures and this
 * list always agree.
 */

const PAGE_SIZE = 10;

const reviewsKey = (productId: string, page: number) => ['reviews', productId, page] as const;

export function ProductReviews({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'NEWEST' | 'HIGHEST' | 'LOWEST' | 'HELPFUL'>('NEWEST');

  const query = useQuery<Page<ReviewResponse>>({
    queryKey: reviewsKey(productId, page),
    queryFn: () =>
      api.requestPage<ReviewResponse>(`/products/${productId}/reviews`, {
        query: { page, limit: PAGE_SIZE },
      }),
  });

  const rawItems = query.data?.items ?? [];

  // Calculate rating statistics
  const stats = useMemo(() => {
    const total = rawItems.length;
    if (total === 0) return { counts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, percentages: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };

    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    rawItems.forEach((r) => {
      const clamped = Math.min(5, Math.max(1, Math.round(r.rating)));
      counts[clamped] = (counts[clamped] || 0) + 1;
    });

    const percentages: Record<number, number> = {
      5: Math.round(((counts[5] ?? 0) / total) * 100),
      4: Math.round(((counts[4] ?? 0) / total) * 100),
      3: Math.round(((counts[3] ?? 0) / total) * 100),
      2: Math.round(((counts[2] ?? 0) / total) * 100),
      1: Math.round(((counts[1] ?? 0) / total) * 100),
    };

    return { counts, percentages };
  }, [rawItems]);

  // Filter & sort reviews
  const displayedReviews = useMemo(() => {
    let list = [...rawItems];
    if (selectedRating !== null) {
      list = list.filter((r) => Math.round(r.rating) === selectedRating);
    }

    list.sort((a, b) => {
      if (sortBy === 'NEWEST') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'HIGHEST') return b.rating - a.rating;
      if (sortBy === 'LOWEST') return a.rating - b.rating;
      if (sortBy === 'HELPFUL') return (b.helpfulCount || 0) - (a.helpfulCount || 0);
      return 0;
    });

    return list;
  }, [rawItems, selectedRating, sortBy]);

  return (
    <section id="reviews" className="space-y-6 border-t border-line pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">Customer Reviews</h2>
          <p className="text-xs text-ink-muted mt-0.5">Verified feedback and ratings from customers</p>
        </div>
      </div>

      {/* Ratings Breakdown Grid */}
      {rawItems.length > 0 && (
        <div className="rounded-theme border border-line bg-surface p-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col justify-center space-y-1">
            <span className="text-3xl font-extrabold text-ink">
              {(rawItems.reduce((acc, r) => acc + r.rating, 0) / rawItems.length).toFixed(1)}
              <span className="text-sm font-normal text-ink-muted"> / 5.0</span>
            </span>
            <StarRating rating={rawItems.reduce((acc, r) => acc + r.rating, 0) / rawItems.length} size="md" />
            <p className="text-xs text-ink-muted pt-1">Based on {rawItems.length} verified ratings</p>
          </div>

          <div className="space-y-2 col-span-1 lg:col-span-2">
            {[5, 4, 3, 2, 1].map((stars) => (
              <button
                key={stars}
                type="button"
                onClick={() => setSelectedRating(selectedRating === stars ? null : stars)}
                className={cn(
                  'flex w-full items-center gap-3 text-xs text-ink-muted hover:text-ink transition-colors group text-left',
                  selectedRating === stars && 'font-bold text-brand',
                )}
              >
                <span className="w-12 shrink-0">{stars} Stars</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      selectedRating === stars ? 'bg-brand' : 'bg-[#f59e0b] group-hover:bg-brand',
                    )}
                    style={{ width: `${stats.percentages[stars]}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right">{stats.percentages[stars]}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters & Sorting Bar */}
      {rawItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-muted font-medium flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filter:
            </span>
            <button
              type="button"
              onClick={() => setSelectedRating(null)}
              className={cn(
                'rounded-theme border px-2.5 py-1 text-xs transition-colors',
                selectedRating === null
                  ? 'border-brand bg-brand text-brand-foreground font-semibold'
                  : 'border-line text-ink-muted hover:border-brand hover:text-ink',
              )}
            >
              All ({rawItems.length})
            </button>
            {[5, 4, 3, 2, 1].map((stars) => (
              <button
                key={stars}
                type="button"
                onClick={() => setSelectedRating(stars)}
                className={cn(
                  'rounded-theme border px-2 py-1 text-xs transition-colors',
                  selectedRating === stars
                    ? 'border-brand bg-brand text-brand-foreground font-semibold'
                    : 'border-line text-ink-muted hover:border-brand hover:text-ink',
                )}
              >
                {stars}★ ({stats.counts[stars]})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-3 w-3 text-ink-muted" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-8 rounded-theme border border-line bg-surface px-2 text-xs text-ink focus:border-brand focus:outline-none"
            >
              <option value="NEWEST">Newest First</option>
              <option value="HIGHEST">Highest Rating</option>
              <option value="LOWEST">Lowest Rating</option>
              <option value="HELPFUL">Most Helpful</option>
            </select>
          </div>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {query.isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-ink-muted">
              <Spinner label="Loading reviews" />
              Loading reviews…
            </div>
          )}

          {query.isError && (
            <Alert>We could not load the reviews for this product just now.</Alert>
          )}

          {query.data && query.data.items.length === 0 && (
            <p className="rounded-theme border border-line bg-surface-alt px-4 py-8 text-center text-sm text-ink-muted">
              No reviews yet. If you have used this product, yours would be the first.
            </p>
          )}

          {displayedReviews.length > 0 && (
            <ul className="space-y-4">
              {displayedReviews.map((review) => (
                <ReviewItem key={review.id} review={review} productId={productId} page={page} />
              ))}
            </ul>
          )}

          {rawItems.length > 0 && displayedReviews.length === 0 && (
            <p className="rounded-theme border border-dashed border-line p-6 text-center text-xs text-ink-muted">
              No reviews found matching {selectedRating}★ filter.
            </p>
          )}
        </div>

        <ReviewForm productId={productId} />
      </div>
    </section>
  );
}

function ReviewItem({
  review,
  productId,
  page,
}: {
  review: ReviewResponse;
  productId: string;
  page: number;
}) {
  const queryClient = useQueryClient();
  const [voted, setVoted] = useState(false);

  const markHelpful = useMutation({
    mutationFn: () => api.request<void>(`/reviews/${review.id}/helpful`, { method: 'POST' }),
    onSuccess: () => {
      setVoted(true);
      // The endpoint answers 204 with no body, so there is no updated count to
      // read — the cached row is bumped locally instead of refetching the page.
      queryClient.setQueryData<Page<ReviewResponse>>(reviewsKey(productId, page), (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === review.id ? { ...item, helpfulCount: item.helpfulCount + 1 } : item,
              ),
            }
          : current,
      );
    },
  });

  return (
    <li className="space-y-3 rounded-theme border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarRating rating={review.rating} size="sm" />
        {review.title && <span className="text-sm font-semibold text-ink">{review.title}</span>}
        {review.isVerifiedPurchase && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
            Verified purchase
          </span>
        )}
      </div>

      <p className="text-xs text-ink-muted">
        {review.authorName ?? 'Anonymous'} · {formatReviewDate(review.createdAt)}
      </p>

      {review.body && <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{review.body}</p>}

      {review.merchantReply && (
        <div className="rounded-theme border-l-2 border-brand bg-surface-alt px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Reply from the shop
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{review.merchantReply}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          // Voted state is per browser session only — the API keeps no per-shopper
          // vote record, so this stops a double-click, not a determined revisit.
          disabled={voted || markHelpful.isPending}
          onClick={() => markHelpful.mutate()}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-theme border border-line px-2.5 py-1 text-xs font-medium transition',
            voted ? 'cursor-default text-brand' : 'text-ink-muted hover:border-brand hover:text-ink',
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
          {voted ? 'Thanks' : 'Helpful'}
          {review.helpfulCount > 0 && <span className="text-ink-muted">({review.helpfulCount})</span>}
        </button>

        {markHelpful.isError && <span className="text-xs text-sale">Could not record that vote.</span>}
      </div>
    </li>
  );
}

function ReviewForm({ productId }: { productId: string }) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [ratingError, setRatingError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api.request<ReviewResponse>('/reviews', {
        method: 'POST',
        body: {
          productId,
          rating,
          // Empty optional strings are dropped rather than sent: the schema caps
          // their length but an empty string is not the same as "not provided".
          title: title.trim() || undefined,
          body: body.trim() || undefined,
          authorName: authorName.trim() || undefined,
          // `customerId`/`orderItemId` are omitted deliberately. There is no
          // storefront customer auth, so every review here is anonymous and
          // unverified; inventing an id to claim a verified badge would be a lie.
        },
      }),
    onSuccess: () => {
      setRating(0);
      setTitle('');
      setBody('');
      setAuthorName('');
    },
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (rating < 1) {
      setRatingError('Please choose a rating.');
      return;
    }
    setRatingError(null);
    submit.mutate();
  }

  if (submit.isSuccess) {
    return (
      <Card className="h-fit p-5">
        <h3 className="font-heading text-base font-semibold text-ink">Thanks for the review</h3>
        {/* Said plainly, because the review genuinely will not appear yet: every
            submission starts PENDING and only counts toward the rating once the
            shop approves it. Silently showing nothing would look like a bug. */}
        <p className="mt-2 text-sm text-ink-muted">
          It has been sent to the shop for approval and will appear here once it is published.
        </p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => submit.reset()}>
          Write another
        </Button>
      </Card>
    );
  }

  return (
    <Card className="h-fit p-5">
      <h3 className="font-heading text-base font-semibold text-ink">Write a review</h3>
      <p className="mt-1 text-sm text-ink-muted">Reviews are published once the shop has approved them.</p>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink">
            Rating
            <span className="ml-0.5 text-sale" aria-hidden>
              *
            </span>
          </legend>
          <RatingPicker value={rating} onChange={(next) => { setRating(next); setRatingError(null); }} />
          {ratingError && (
            <p className="mt-1.5 text-xs text-sale" role="alert">
              {ratingError}
            </p>
          )}
        </fieldset>

        <Field label="Title" htmlFor="review-title">
          <Input
            id="review-title"
            value={title}
            maxLength={255}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Sums up your experience"
          />
        </Field>

        <Field label="Your review" htmlFor="review-body">
          <Textarea
            id="review-body"
            rows={4}
            maxLength={5000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What worked, what didn't?"
          />
        </Field>

        <Field label="Your name" htmlFor="review-author" hint="Shown with your review. Leave blank to post anonymously.">
          <Input
            id="review-author"
            value={authorName}
            maxLength={120}
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder="Anonymous"
          />
        </Field>

        {submit.isError && (
          <Alert>
            {submit.error instanceof ApiError
              ? (submit.error.fieldMessage ?? submit.error.message)
              : 'We could not submit your review. Please try again.'}
          </Alert>
        )}

        <Button type="submit" loading={submit.isPending} className="w-full">
          Submit review
        </Button>
      </form>
    </Card>
  );
}

/** Five radio-equivalent buttons. Not a `<select>`: picking a star rating from a dropdown is a chore. */
function RatingPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
          aria-pressed={value === star}
          className="rounded p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        >
          <Star
            className={cn('h-6 w-6 transition', star <= shown ? 'fill-current text-[#f59e0b]' : 'text-line')}
            aria-hidden
          />
        </button>
      ))}
      <span className="ml-2 text-sm text-ink-muted">{value > 0 ? `${value}/5` : ''}</span>
    </div>
  );
}

function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
