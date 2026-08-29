'use client';

import { ImagePlus, Loader2, X } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { storageService } from '@/services';
import { useToast } from './toast';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * Image picker wired to the upload endpoint.
 *
 * The server re-encodes to WebP and strips metadata; the checks here just
 * avoid a pointless round trip for a file that will obviously be rejected.
 */
export function ImageUpload({
  value,
  onChange,
  folder = 'products',
  label = 'تصویر',
  hint,
  className,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder?: 'products' | 'branding';
  label?: string;
  hint?: string;
  className?: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      toast.error('فرمت پشتیبانی نمی‌شود', 'از JPEG، PNG یا WebP استفاده کنید.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('حجم تصویر زیاد است', 'حداکثر ۸ مگابایت.');
      return;
    }

    setUploading(true);
    try {
      const result = await storageService.uploadImage(file, folder);
      onChange(result.url);
      toast.success('تصویر بارگذاری شد');
    } catch (error) {
      toast.error(
        'بارگذاری انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="block text-sm font-medium text-ink-muted">{label}</span>

      <div className="flex items-center gap-3">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-sunken">
          {value ? (
            <>
              <Image
                src={value}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
                unoptimized
              />
              <button
                type="button"
                onClick={() => onChange(null)}
                aria-label="حذف تصویر"
                className="absolute end-1 top-1 rounded-lg bg-black/60 p-1 text-white hover:bg-critical"
              >
                <X className="size-3.5" />
              </button>
            </>
          ) : (
            <div className="flex size-full items-center justify-center text-ink-subtle">
              <ImagePlus className="size-6" />
            </div>
          )}

          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="size-5 animate-spin text-gold" />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded-xl border border-line-strong px-4 py-2 text-sm text-ink transition-colors hover:bg-surface-raised disabled:opacity-50"
          >
            {value ? 'تغییر تصویر' : 'انتخاب تصویر'}
          </button>
          <p className="mt-1.5 text-xs text-ink-subtle">
            {hint ?? 'JPEG، PNG یا WebP — حداکثر ۸ مگابایت'}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
