'use client';

import { OrderStatus } from '@restaurant-os/types';
import { useMutation } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Textarea, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { guestService } from '@/services';

/**
 * Post-order rating.
 *
 * Only appears once the food has actually reached the guest - asking someone
 * to rate a meal that is still being cooked produces noise, not signal.
 */
export function FeedbackCard({
  token,
  status,
}: {
  token: string;
  status: OrderStatus;
}) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  const eligible =
    status === OrderStatus.SERVED ||
    status === OrderStatus.PICKED_UP ||
    status === OrderStatus.COMPLETED;

  const submit = useMutation({
    mutationFn: () =>
      guestService.submitFeedback(token, {
        rating,
        comment: comment.trim() || null,
      }),
    onSuccess: () => {
      setSubmitted(true);
      toast.success('ممنون از نظر شما');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        // Already rated - most likely a second tab or a page refresh.
        setAlreadyRated(true);
        return;
      }
      toast.error(
        'ثبت نظر انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      );
    },
  });

  if (!eligible) return null;

  if (submitted || alreadyRated) {
    return (
      <Card className="mt-4 border-positive/30">
        <div className="p-5 text-center">
          <div className="mb-2 flex justify-center gap-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star
                key={index}
                className={cn(
                  'size-5',
                  index < (rating || 5)
                    ? 'fill-gold text-gold'
                    : 'text-line-strong',
                )}
              />
            ))}
          </div>
          <p className="text-sm font-medium text-positive">
            {alreadyRated ? 'نظر شما قبلاً ثبت شده است' : 'نظر شما ثبت شد'}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            بازخورد شما به بهتر شدن کیفیت کمک می‌کند.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <div className="p-5">
        <h2 className="text-center text-sm font-semibold text-ink">
          سفارش شما چطور بود؟
        </h2>

        <div
          className="mt-3 flex justify-center gap-1.5"
          role="radiogroup"
          aria-label="امتیاز"
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} ستاره`}
              onClick={() => setRating(value)}
              onMouseEnter={() => setHovered(value)}
              onMouseLeave={() => setHovered(0)}
              className="rounded-lg p-1 transition-transform hover:scale-110"
            >
              <Star
                className={cn(
                  'size-8 transition-colors',
                  value <= (hovered || rating)
                    ? 'fill-gold text-gold'
                    : 'text-line-strong',
                )}
              />
            </button>
          ))}
        </div>

        {rating > 0 ? (
          <div className="mt-4 space-y-3">
            <Textarea
              placeholder={
                rating >= 4
                  ? 'چه چیزی بیشتر از همه خوب بود؟ (اختیاری)'
                  : 'چه چیزی می‌توانست بهتر باشد؟ (اختیاری)'
              }
              rows={2}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button
              variant="primary"
              fullWidth
              loading={submit.isPending}
              onClick={() => submit.mutate()}
            >
              ثبت نظر
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
