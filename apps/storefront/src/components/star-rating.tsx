import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Five stars, filled to the nearest half.
 *
 * Half-filled is done with a clipped overlay rather than a half-star glyph so the
 * same icon set covers every state, and so a rating of 4.3 does not have to round
 * to 4 and lose the distinction from a flat 4.0 sitting next to it.
 */
export function StarRating({
  rating,
  count,
  size = 'md',
  className,
}: {
  rating: number;
  /** Rendered as "(12)" beside the stars. Omit to show stars alone. */
  count?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, rating));
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className="inline-flex items-center gap-0.5"
        role="img"
        aria-label={`Rated ${clamped.toFixed(1)} out of 5`}
      >
        {[0, 1, 2, 3, 4].map((index) => {
          const fill = Math.max(0, Math.min(1, clamped - index));

          return (
            <span key={index} className={cn('relative inline-block', iconSize)}>
              <Star className={cn(iconSize, 'absolute inset-0 text-line')} aria-hidden />
              {fill > 0 && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                  aria-hidden
                >
                  <Star className={cn(iconSize, 'fill-current text-[#f59e0b]')} />
                </span>
              )}
            </span>
          );
        })}
      </span>
      {count !== undefined && (
        <span className={cn('text-ink-muted', size === 'sm' ? 'text-xs' : 'text-sm')}>
          {count === 0 ? 'No reviews' : `(${count})`}
        </span>
      )}
    </span>
  );
}
