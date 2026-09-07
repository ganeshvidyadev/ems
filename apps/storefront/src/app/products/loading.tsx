/**
 * Skeleton for the catalogue while the server renders the next result set.
 *
 * Shaped like the grid it replaces — same aspect ratio, same breakpoints — so the
 * page does not jump when the real cards arrive. A centred spinner would collapse
 * the layout to nothing and then push everything back down.
 */
export default function ProductsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-theme bg-surface-alt" />
        <div className="h-4 w-24 animate-pulse rounded-theme bg-surface-alt" />
      </div>

      <div className="h-10 w-full animate-pulse rounded-theme bg-surface-alt sm:max-w-sm" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-theme border border-line p-3">
            <div className="aspect-square w-full animate-pulse rounded-theme bg-surface-alt" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-alt" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-surface-alt" />
          </div>
        ))}
      </div>

      <span className="sr-only" role="status">
        Loading products
      </span>
    </div>
  );
}
