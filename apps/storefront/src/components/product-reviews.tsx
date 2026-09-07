'use client';

import type { ReviewResponse } from '@ems/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, MessageSquare, Star, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
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

const PAGE_SIZE = 5;

const reviewsKey = (productId: string, page: number) => ['reviews', productId, page] as const;

export function ProductReviews({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);

  const query = useQuery<Page<ReviewResponse>>({
    queryKey: reviewsKey(productId, page),
    queryFn: () =>
      api.requestPage<ReviewResponse>(`/products/${productId}/reviews`, {
        query: { page, limit: PAGE_SIZE },
      }),
  });

  return (
    <section id="reviews" className="space-y-6 border-t border-line pt-10">
      <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">Reviews</h2>

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

          {query.data && query.data.items.length > 0 && (
            <>
              <ul className="space-y-4">
                {query.data.items.map((review) => (
                  <ReviewItem key={review.id} review={review} productId={productId} page={page} />
                ))}
              </ul>

              {query.data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!query.data.pagination.hasPrev}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-ink-muted">
                    Page {query.data.pagination.page} of {query.data.pagination.totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!query.data.pagination.hasNext}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
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
