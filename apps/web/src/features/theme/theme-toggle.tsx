'use client';

import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useThemeMode } from './theme-context';

/**
 * Day/night switch.
 *
 * Lives in the top-left of every surface - the admin panel, the platform
 * console and the guest menu - so the control is in the same place whichever
 * one you are looking at.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { mode, toggle } = useThemeMode();
  const toLight = mode === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={toLight ? 'حالت روشن' : 'حالت تیره'}
      title={toLight ? 'حالت روشن' : 'حالت تیره'}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-xl border border-line',
        'text-ink-muted transition-colors hover:border-line-strong hover:text-ink',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
        className,
      )}
    >
      {toLight ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
