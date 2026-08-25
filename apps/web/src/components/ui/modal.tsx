'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { Button } from './button';

/**
 * Modal dialog. On mobile it becomes a bottom sheet, which is the interaction
 * pattern a thumb actually expects - not a shrunken desktop dialog.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnBackdrop?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // Prevent the page behind the dialog from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog for keyboard and screen-reader users.
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 40);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const sizes = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
    full: 'sm:max-w-[95vw] sm:h-[92vh]',
  } as const;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm animate-fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        className={cn(
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden',
          'glass shadow-lifted',
          'rounded-t-3xl sm:rounded-2xl',
          'animate-slide-up sm:animate-scale-in',
          sizes[size],
        )}
      >
        {/* Drag affordance, mobile only. */}
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" />

        {title ? (
          <div className="flex items-start justify-between gap-4 px-5 py-4 sm:border-b sm:border-line">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              {description ? (
                <p className="mt-1 text-sm text-ink-muted">{description}</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="بستن"
              className="-me-2 shrink-0"
            >
              <X className="size-5" />
            </Button>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer ? (
          <div className="border-t border-line bg-surface-sunken/60 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Destructive-action confirmation. Never delete without one of these. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'تأیید',
  cancelLabel = 'انصراف',
  tone = 'danger',
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} fullWidth disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            fullWidth
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-ink-muted">{message}</p>
    </Modal>
  );
}
