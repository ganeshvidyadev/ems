import { cn } from '@/lib/utils';

/**
 * Stands in for a product image.
 *
 * The catalogue has no image field — `productResponseSchema` carries no `images`
 * or `media`, and media management is a separate feature — so there is no URL to
 * render and an `<img>` here would be a broken icon on every card. A generated
 * monogram tile is honest about that while still giving the grid the consistent
 * rhythm it needs to read as a shop rather than a list.
 *
 * The colour is derived from the product's own name, so a product keeps the same
 * tile between the grid and its detail page instead of appearing to change
 * identity on navigation.
 */

const TILE_CLASSES = [
  'bg-[#eef2ff] text-[#3730a3]',
  'bg-[#ecfdf5] text-[#065f46]',
  'bg-[#fef3c7] text-[#92400e]',
  'bg-[#fce7f3] text-[#9d174d]',
  'bg-[#e0f2fe] text-[#075985]',
  'bg-[#f1f5f9] text-[#334155]',
] as const;

/** A small deterministic hash — only needs to spread names across six buckets. */
function tileFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_000;
  }
  return TILE_CLASSES[hash % TILE_CLASSES.length]!;
}

/** Initials from the first two significant words: "LED Monitor Light Bar" → "LM". */
function initialsFor(name: string): string {
  const words = name
    .split(/[\s—–-]+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);

  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

export function ProductThumb({
  name,
  className,
  textClassName,
}: {
  name: string;
  className?: string;
  textClassName?: string;
}) {
  return (
    <div
      // Decorative: the product name is always adjacent as real text, so
      // announcing the monogram too would just repeat it.
      aria-hidden
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-theme font-heading font-semibold tracking-tight',
        tileFor(name),
        className,
      )}
    >
      <span className={cn('select-none', textClassName)}>{initialsFor(name)}</span>
    </div>
  );
}
