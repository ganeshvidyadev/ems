import { cache } from 'react';
import { storefrontFetch } from './tenant';

export type StorefrontTheme = 'default' | 'organic' | 'famms' | 'circuit' | 'harvest';

const VALID_THEMES: readonly StorefrontTheme[] = ['default', 'organic', 'famms', 'circuit', 'harvest'];

// Per-request memoization keeps the layout and homepage on the same assignment.
// No shared cache: revoking a design takes effect on the next request.
export const getStorefrontTheme = cache(async (): Promise<StorefrontTheme> => {
  try {
    const assignment = await storefrontFetch<{ selectedTheme: string; allowedThemes: string[] }>(
      '/theme-assignment',
      { revalidate: 0 },
    );
    const code = assignment.selectedTheme as StorefrontTheme;
    return VALID_THEMES.includes(code) && assignment.allowedThemes.includes(code)
      ? code
      : 'default';
  } catch {
    return 'default';
  }
});
