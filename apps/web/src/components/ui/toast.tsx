'use client';

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Optional single action, e.g. undo. */
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (input: Omit<Toast, 'id'> & { durationMs?: number }) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { ring: string; icon: ReactNode }> = {
  success: {
    ring: 'border-positive/35',
    icon: <CheckCircle2 className="size-5 text-positive" />,
  },
  error: {
    ring: 'border-critical/35',
    icon: <XCircle className="size-5 text-critical" />,
  },
  warning: {
    ring: 'border-caution/35',
    icon: <AlertTriangle className="size-5 text-caution" />,
  },
  info: { ring: 'border-info/35', icon: <Info className="size-5 text-info" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // The portal is mounted only after hydration: rendering it on the first
  // client pass but not on the server is exactly the kind of tree difference
  // that breaks hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ durationMs = 4500, ...input }: Omit<Toast, 'id'> & { durationMs?: number }) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((current) => [...current.slice(-3), { ...input, id }]);
      if (durationMs > 0) {
        window.setTimeout(() => dismiss(id), durationMs);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) =>
        toast({ tone: 'error', title, description, durationMs: 7000 }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:bottom-4 sm:start-4 sm:items-start"
              role="region"
              aria-label="اعلان‌ها"
            >
              {toasts.map((item) => (
                <div
                  key={item.id}
                  role="status"
                  aria-live="polite"
                  className={cn(
                    'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-4',
                    'glass shadow-lifted animate-fade-in',
                    TONE_STYLES[item.tone].ring,
                  )}
                >
                  <span className="mt-0.5 shrink-0">{TONE_STYLES[item.tone].icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{item.title}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                        {item.description}
                      </p>
                    ) : null}
                    {item.action ? (
                      <button
                        onClick={() => {
                          item.action?.onClick();
                          dismiss(item.id);
                        }}
                        className="mt-2 text-xs font-semibold text-gold hover:text-gold-bright"
                      >
                        {item.action.label}
                      </button>
                    ) : null}
                  </div>
                  <button
                    onClick={() => dismiss(item.id)}
                    aria-label="بستن اعلان"
                    className="shrink-0 rounded-lg p-1 text-ink-subtle hover:bg-surface-raised hover:text-ink"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return context;
}
