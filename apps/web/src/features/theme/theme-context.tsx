'use client';

import type { ThemeMode } from '@restaurant-os/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const THEME_STORAGE_KEY = 'foodos:theme';

interface ThemeState {
  /** The mode in effect for the app shell. */
  mode: ThemeMode;
  /**
   * Whether the viewer picked this themselves.
   *
   * The customer menu needs the distinction: an untouched preference means
   * "render the restaurant's own palette", not "render dark".
   */
  chosen: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/**
 * Reads the stored preference without throwing.
 *
 * Private windows and blocked site data make every storage access a possible
 * exception, and a theme preference is never worth breaking a page over.
 */
function readStored(): ThemeMode | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'dark' || raw === 'light' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * The script that runs before first paint.
 *
 * Without it the page renders in the default theme and then snaps to the
 * stored one, which is the flash every themed site is judged by. Kept as a
 * string so it can be inlined in the document head.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${THEME_STORAGE_KEY}');if(m==='light'||m==='dark'){document.documentElement.dataset.theme=m;document.documentElement.dataset.themeChosen='1';}}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Starts at the server-rendered default; the effect below adopts whatever
  // the pre-paint script already applied, so the two never disagree.
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [chosen, setChosen] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setModeState(stored);
      setChosen(true);
      return;
    }
    /*
     * Nobody has chosen, so follow the system - which is what the stylesheet
     * already renders. Read here as well so the switch shows the mode the
     * viewer is actually looking at rather than the one we default to, and
     * `chosen` stays false so a customer menu still renders the restaurant's
     * own palette.
     */
    try {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setModeState('dark');
      }
    } catch {
      // No matchMedia is simply no preference.
    }
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setChosen(true);
    const root = document.documentElement;
    root.dataset.theme = next;
    root.dataset.themeChosen = '1';
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // A viewer who blocks storage still gets the switch for this visit.
    }
  }, []);

  const value = useMemo<ThemeState>(
    () => ({
      mode,
      chosen,
      setMode,
      toggle: () => setMode(mode === 'dark' ? 'light' : 'dark'),
    }),
    [mode, chosen, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode(): ThemeState {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used inside <ThemeProvider>');
  }
  return context;
}
