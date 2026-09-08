'use client';

import type { LoginResponse, UserSummary } from '@ems/contracts';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, apiPost, setAccessToken, setUnauthenticatedHandler } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';

interface AuthContextValue {
  user: UserSummary | null;
  status: 'unknown' | 'authenticating' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string, tenantSlug?: string) => Promise<LoginResponse>;
  completeMfa: (mfaToken: string, code: string, method: 'TOTP' | 'RECOVERY_CODE') => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Every route in `app/(auth)/` — a failed refresh on any of these must not
 * bounce the visitor to `/login`, since they're the pages a signed-out
 * visitor is actually trying to use.
 *
 * Found live (BUG-FE-001): this used to check only `pathname.startsWith('/login')`,
 * so `/forgot-password`, `/reset-password`, `/verify-email` and `/accept-invite`
 * all redirected an unauthenticated visitor straight back to `/login` the
 * instant the bootstrap refresh 401'd — before they could ever use the page.
 * It only rendered correctly while already signed in, which is why it went
 * unnoticed: every manual check of these pages happened from an authenticated
 * session.
 */
const AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password', '/verify-email', '/accept-invite'];

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Session lifecycle.
 *
 * Two behaviours carry the design:
 *
 *  1. **Silent refresh on mount.** The access token lives in memory only, so a page
 *     reload always starts unauthenticated. Calling `/auth/refresh` with the httpOnly
 *     cookie rebuilds the session. That is the cost of keeping the token out of
 *     `localStorage` where any script could read it — one request per page load in
 *     exchange for a token that cannot be exfiltrated.
 *
 *  2. **Proactive refresh before expiry.** A timer refreshes at ~80 % of the token's
 *     lifetime rather than waiting for a 401. Reacting to 401s means the user's *first*
 *     action after ten idle minutes visibly stalls; refreshing ahead of time means they
 *     never see it. The reactive path in `api-client` remains as the safety net for
 *     sleep/suspend, where timers do not fire.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, status, setSession, clearSession, setStatus } = useAuthStore();
  const [bootstrapped, setBootstrapped] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);

    // 80 % of the lifetime, floored at 30s so a very short token cannot cause a
    // refresh storm.
    const delayMs = Math.max(30_000, expiresInSeconds * 0.8 * 1_000);

    refreshTimer.current = setTimeout(() => {
      void refresh();
    }, delayMs);
  }, []);

  const applySession = useCallback(
    (payload: Extract<LoginResponse, { outcome: 'AUTHENTICATED' }>) => {
      setSession(payload.user, payload.accessToken);
      scheduleRefresh(payload.expiresIn);
    },
    [setSession, scheduleRefresh],
  );

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const result = await apiPost<Extract<LoginResponse, { outcome: 'AUTHENTICATED' }>>(
        '/auth/refresh',
      );
      applySession(result);
      return true;
    } catch {
      clearSession();
      return false;
    }
  }, [applySession, clearSession]);

  // Bootstrap: attempt silent refresh exactly once.
  useEffect(() => {
    let cancelled = false;

    setUnauthenticatedHandler(() => {
      clearSession();
      // Only redirect if not already on an auth page, otherwise a failed refresh on
      // login/forgot-password/reset-password/verify-email/accept-invite bounces the
      // visitor away from the very page they're trying to use.
      if (!isAuthRoute(window.location.pathname)) {
        router.replace('/login');
      }
    });

    void (async () => {
      setStatus('authenticating');
      await refresh();
      if (!cancelled) setBootstrapped(true);
    })();

    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
    // Intentionally mount-only: re-running this would re-trigger a refresh on every
    // render of a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string, tenantSlug?: string): Promise<LoginResponse> => {
      setStatus('authenticating');

      try {
        const result = await apiPost<LoginResponse>('/auth/login', {
          email,
          password,
          ...(tenantSlug ? { tenantSlug } : {}),
          rememberDevice: false,
        });

        if (result.outcome === 'AUTHENTICATED') {
          applySession(result);
        } else {
          // MFA pending — deliberately NOT authenticated. The store stays empty so no
          // protected route can render on the strength of a half-finished login.
          setStatus('unauthenticated');
        }

        return result;
      } catch (error) {
        setStatus('unauthenticated');
        throw error;
      }
    },
    [applySession, setStatus],
  );

  const completeMfa = useCallback(
    async (mfaToken: string, code: string, method: 'TOTP' | 'RECOVERY_CODE') => {
      const result = await apiPost<LoginResponse>('/auth/mfa/verify', { mfaToken, code, method });
      if (result.outcome !== 'AUTHENTICATED') {
        throw new ApiError('AUTH_MFA_INVALID_CODE', 'Verification did not complete', 401);
      }
      applySession(result);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } catch {
      // Even if the call fails, clear locally — a user who clicked "sign out" must not be
      // left holding a live token because the network blipped.
    } finally {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      setAccessToken(null);
      clearSession();
      router.replace('/login');
    }
  }, [clearSession, router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        status: bootstrapped ? status : 'authenticating',
        login,
        completeMfa,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Permission-aware conditional rendering. Server-side checks still apply. */
export function usePermission(code: string): boolean {
  return useAuthStore((state) => state.hasPermission(code));
}
