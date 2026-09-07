import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind classes so a caller's override actually wins.
 *
 * Plain concatenation loses: `"px-4" + "px-6"` leaves both in the class list and
 * the winner is whichever CSS rule the build happened to emit last, not the one
 * the caller passed. `twMerge` resolves it by conflict group instead.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** `northwind` → `Northwind`. Used only as a fallback before the store name loads. */
export function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
