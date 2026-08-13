import type { UserSummary } from '@ems/contracts';
import { create } from 'zustand';
import { setAccessToken } from '@/lib/api-client';

/**
 * Authentication state.
 *
 * Deliberately **not** persisted. Zustand's `persist` middleware would write this
 * to `localStorage`, and the access token must never live anywhere a script can
 * read it. On reload the app calls `/auth/refresh` with the httpOnly cookie and
 * rebuilds this state — one extra request in exchange for a token that cannot be
 * exfiltrated by a compromised dependency.
 *
 * Server data (products, orders) belongs in React Query, not here. Mixing the two
 * is how a store ends up as a second, stale cache that has to be manually
 * invalidated. This holds only what is genuinely client state: who is logged in.
 */
interface AuthState {
  user: UserSummary | null;
  /** Distinguishes "not logged in" from "we haven't checked yet". */
  status: 'unknown' | 'authenticating' | 'authenticated' | 'unauthenticated';

  setSession: (user: UserSummary, accessToken: string) => void;
  clearSession: () => void;
  setStatus: (status: AuthState['status']) => void;

  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
  isPlatformUser: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'unknown',

  setSession: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user, status: 'authenticated' });
  },

  clearSession: () => {
    setAccessToken(null);
    set({ user: null, status: 'unauthenticated' });
  },

  setStatus: (status) => set({ status }),

  /**
   * Client-side permission check for *rendering* only.
   *
   * This hides UI a user cannot use; it is not a security boundary. The server
   * re-checks every permission on every request, because anything decided in the
   * browser can be edited in the browser.
   */
  hasPermission: (code) => {
    const user = get().user;
    if (!user) return false;

    if (user.permissions.includes(code)) return true;

    // Wildcard grants: `product:*` covers `product:update`.
    const [resource] = code.split(':');
    return user.permissions.includes(`${resource}:*`) || user.permissions.includes('*');
  },

  hasAnyPermission: (codes) => codes.some((code) => get().hasPermission(code)),

  isPlatformUser: () => get().user?.userType === 'PLATFORM',
}));
