import { cache } from 'react';
import { storefrontFetch } from './tenant';

export type StorefrontTheme = 'default' | 'organic' | 'famms';

// Per-request memoization keeps the layout and homepage on the same assignment.
// No shared cache: revoking a design takes effect on the next request.
export const getStorefrontTheme = cache(async (): Promise<StorefrontTheme> => {
  try {
    const assignment = await storefrontFetch<{ selectedTheme: string; allowedThemes: string[] }>(
      '/theme-assignment',
      { revalidate: 0 },
    );
    const code = assignment.selectedTheme;
    return (code === 'organic' || code === 'famms') && assignment.allowedThemes.includes(code)
      ? code
      : 'default';
  } catch {
    return 'default';
  }
});
