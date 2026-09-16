'use client';

import { createContext, useContext } from 'react';

/** Presentation context also carries the scoped palette into Radix portals. */
export const AdminThemeContext = createContext(false);
export function useAdminTheme() {
  return useContext(AdminThemeContext);
}
