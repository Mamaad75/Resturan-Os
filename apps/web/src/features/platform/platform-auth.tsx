'use client';

import type { PlatformAdminDto } from '@restaurant-os/types';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { platformService } from '@/services';

interface PlatformAuthValue {
  admin: PlatformAdminDto | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const PlatformAuthContext = createContext<PlatformAuthValue | null>(null);

/**
 * Platform session state.
 *
 * Deliberately separate from the tenant `AuthProvider`: the two sessions have
 * different cookies, different signing keys and different lifetimes, and a
 * shared provider would be one refactor away from leaking one into the other.
 * Signing into a restaurant does not sign you into FoodOS, and vice versa.
 *
 * Both tokens are httpOnly cookies, so nothing is held in localStorage where
 * an XSS could read it.
 */
export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<PlatformAdminDto | null>(null);
  const [status, setStatus] = useState<PlatformAuthValue['status']>('loading');

  useEffect(() => {
    let cancelled = false;
    // The refresh cookie survives a reload; the access cookie is short-lived.
    platformService
      .refresh()
      .then((session) => {
        if (cancelled) return;
        setAdmin(session.admin);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await platformService.login({ email, password });
    setAdmin(session.admin);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await platformService.logout().catch(() => undefined);
    setAdmin(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({ admin, status, login, logout }),
    [admin, status, login, logout],
  );

  return (
    <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>
  );
}

export function usePlatformAuth(): PlatformAuthValue {
  const value = useContext(PlatformAuthContext);
  if (!value) {
    throw new Error('usePlatformAuth must be used inside PlatformAuthProvider');
  }
  return value;
}

/** Sends an unauthenticated visitor to the platform sign-in page. */
export function usePlatformGuard() {
  const { status } = usePlatformAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'anonymous') router.replace('/superadmin/login');
  }, [status, router]);
  return status;
}
