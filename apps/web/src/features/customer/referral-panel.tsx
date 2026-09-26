'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Gift, Share2 } from 'lucide-react';
import { useState } from 'react';
import { formatDateFa, toPersianDigits } from '@/lib/format';
import { publicService } from '@/services';

/**
 * "Invite a friend", from the guest's side.
 *
 * Shown on the order-tracking page, which is where a customer sits with their
 * phone in hand waiting for food - the one moment they are both pleased and
 * idle. The code is one tap to copy or share; the progress bar is there because
 * "two more friends" is a far better prompt than "invite friends".
 *
 * Renders nothing when the restaurant has not turned the programme on.
 */
export function ReferralPanel({
  slug,
  trackingToken,
  restaurantName,
}: {
  slug: string;
  trackingToken: string;
  restaurantName: string;
}) {
  const [copied, setCopied] = useState(false);

  const query = useQuery({
    queryKey: ['referral-panel', slug, trackingToken],
    queryFn: () => publicService.referral(slug, trackingToken),
    staleTime: 60_000,
  });

  const panel = query.data;
  if (!panel?.isActive || !panel.code) return null;

  // Narrowed once, so the handlers below do not each have to re-prove it.
  const code = panel.code;
  const remaining = Math.max(0, panel.invitesRequired - panel.invitedCount);
  const shareText = [
    `${restaurantName} را امتحان کن.`,
    panel.friendRewardLabelFa
      ? `با کد من ${panel.friendRewardLabelFa} می‌گیری: ${code}`
      : `کد معرفی من: ${code}`,
  ].join(' ');

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // No clipboard permission: the code is on screen to read out anyway.
    }
  }

  async function share() {
    // The Web Share API is the whole point on a phone - it reaches the
    // messaging app the friend is actually in.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch {
        // Cancelled, or refused: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Nothing left to try; the text is on screen.
    }
  }

  return (
    <section className="rounded-2xl border border-gold/30 bg-gold/[0.06] p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <Gift className="size-4 text-gold" aria-hidden />
        دوستت را دعوت کن
      </h2>

      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        {panel.friendRewardLabelFa
          ? `دوستت با کد تو ${panel.friendRewardLabelFa} می‌گیرد و تو ${panel.rewardLabelFa}.`
          : `برای هر دعوت موفق، ${panel.rewardLabelFa} می‌گیری.`}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="ltr-nums flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-gold/50 bg-surface px-4 py-3 font-mono text-lg font-bold tracking-[0.2em] text-gold"
          aria-label={`کپی کد دعوت ${code}`}
        >
          {code}
          {copied ? (
            <Check className="size-4 text-positive" aria-hidden />
          ) : (
            <Copy className="size-4 opacity-60" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className="flex items-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-ink-inverse"
        >
          <Share2 className="size-4" aria-hidden />
          فرستادن
        </button>
      </div>

      <p className="mt-3 text-xs text-ink-subtle">
        {panel.invitedCount === 0
          ? `هنوز کسی با کد تو سفارش نداده. با ${toPersianDigits(
              panel.invitesRequired,
            )} دعوت، پاداش تو فعال می‌شود.`
          : remaining > 0
            ? `${toPersianDigits(panel.invitedCount)} دعوت انجام شده؛ ${toPersianDigits(
                remaining,
              )} دعوت دیگر تا پاداش بعدی.`
            : `${toPersianDigits(panel.invitedCount)} دعوت انجام شده.`}
      </p>

      {panel.termsFa ? (
        <p className="mt-1 text-xs text-ink-subtle">{panel.termsFa}</p>
      ) : null}

      {panel.rewards.length > 0 ? (
        <div className="mt-4 rounded-xl border border-positive/30 bg-positive/10 p-3">
          <p className="text-xs font-medium text-positive">پاداش‌های آماده استفاده</p>
          <ul className="mt-1.5 space-y-1">
            {panel.rewards.map((reward) => (
              <li key={reward.id} className="text-sm text-ink">
                {reward.labelFa}
                <span className="text-xs text-ink-subtle">
                  {' '}
                  — تا {formatDateFa(reward.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            در سفارش بعدی، هنگام پرداخت اعمالش کن.
          </p>
        </div>
      ) : null}
    </section>
  );
}
