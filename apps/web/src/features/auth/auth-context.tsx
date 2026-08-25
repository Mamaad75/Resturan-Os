'use client';

import {
  ROLE_HOME_ROUTE,
  type AuthSession,
  type AuthUser,
  type BranchSummary,
  type Permission,
} from '@restaurant-os/types';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  setSessionLostHandler,
  setTokenRefreshHandler,
} from '@/lib/api-client';
import { authService } from '@/services';

interface AuthContextValue {
  user: AuthUser | null;
  tenant: AuthSession['tenant'] | null;
  branches: BranchSummary[];
  /** Kept in memory only, for the websocket handshake. */
  accessToken: string | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string, tenantSlug?: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  switchBranch: (branchId: string) => Promise<void>;
  can: (...permissions: Permission[]) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Customer-facing routes, which never have a session.
 *
 * `/login` is deliberately absent: it still bootstraps, so an already
 * authenticated user landing there is redirected to their home surface
 * instead of being shown a pointless form.
 */
function isCustomerSurface(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.startsWith('/r/') || pathname.startsWith('/order/track/');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const bootstrapped = useRef(false);

  /*
   * Tokens live in httpOnly cookies, so on a fresh page load the app has no
   * idea who it is until it asks. `/auth/refresh` both rotates the session and
   * returns the identity, which is exactly what bootstrapping needs.
   */
  useEffect(() => {
    if (bootstrapped.current) return;
    // A customer scanning a QR code never has a session; asking for one would
    // just add a guaranteed 401 to the critical path.
    if (isCustomerSurface(pathname)) {
      setStatus('anonymous');
      return;
    }
    bootstrapped.current = true;

    (async () => {
      try {
        const restored = await authService.refresh();
        setSession(restored);
        setAccessToken(restored.accessToken);
        setStatus('authenticated');
      } catch {
        setStatus('anonymous');
      }
    })();
  }, [pathname]);

  // Keep the in-memory token in step with transparent refreshes made by the
  // API client, so a long-lived websocket can reconnect with a valid token.
  useEffect(() => {
    setTokenRefreshHandler((token) => setAccessToken(token));
    setSessionLostHandler(() => {
      setSession(null);
      setAccessToken(null);
      setStatus('anonymous');
    });
    return () => {
      setTokenRefreshHandler(null);
      setSessionLostHandler(null);
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string, tenantSlug?: string) => {
      const next = await authService.login({ email, password, tenantSlug });
      setSession(next);
      setAccessToken(next.accessToken);
      setStatus('authenticated');
      return next.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Even if the call fails, clear locally: the user asked to leave.
    }
    setSession(null);
    setAccessToken(null);
    setStatus('anonymous');
    router.push('/login');
  }, [router]);

  const switchBranch = useCallback(async (branchId: string) => {
    const result = await authService.switchBranch(branchId);
    setAccessToken(result.accessToken);
    const refreshed = await authService.me();
    setSession((current) =>
      current
        ? { ...current, user: { ...refreshed.user, branchId }, branches: refreshed.branches }
        : refreshed,
    );
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await authService.me();
      setSession((current) => (current ? { ...current, ...next } : next));
    } catch (error) {
      if (error instanceof ApiError && error.isAuthError) {
        setSession(null);
        setStatus('anonymous');
      }
    }
  }, []);

  const can = useCallback(
    (...permissions: Permission[]) => {
      if (!session?.user) return false;
      if (permissions.length === 0) return true;
      return permissions.some((permission) =>
        session.user.permissions.includes(permission),
      );
    },
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      tenant: session?.tenant ?? null,
      branches: session?.branches ?? [],
      accessToken,
      status,
      login,
      logout,
      switchBranch,
      can,
      refresh,
    }),
    [session, accessToken, status, login, logout, switchBranch, can, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

/** Where a role should land after signing in. */
export function homeRouteForUser(user: AuthUser): string {
  return ROLE_HOME_ROUTE[user.role] ?? '/admin';
}
