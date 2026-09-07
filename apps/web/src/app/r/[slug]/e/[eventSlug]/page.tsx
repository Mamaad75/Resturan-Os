'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { formatDateFa } from '@/lib/format';
import { publicEventService, type PublicEventDetail } from '@/services';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: PublicEventDetail };

export default function PublicEventPage() {
  const params = useParams<{ slug: string; eventSlug: string }>();
  const slug = params.slug;
  const eventSlug = params.eventSlug;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    publicEventService
      .get(slug, eventSlug)
      .then((data) => alive && setState({ status: 'ready', data }))
      .catch((error) =>
        alive &&
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'رویداد یافت نشد.',
        }),
      );
    return () => {
      alive = false;
    };
  }, [slug, eventSlug]);

  const accent =
    state.status === 'ready' ? state.data.event.accentColor ?? '#C9A24B' : '#C9A24B';
  const dark =
    state.status === 'ready' ? state.data.event.theme !== 'light' : true;

  const palette = useMemo(
    () =>
      dark
        ? { bg: '#0B0B0D', card: '#151518', text: '#F5F5F4', muted: '#A1A1AA', line: '#26262B' }
        : { bg: '#FAFAF9', card: '#FFFFFF', text: '#1C1917', muted: '#57534E', line: '#E7E5E4' },
    [dark],
  );

  return (
    <main
      dir="rtl"
      style={{ background: palette.bg, color: palette.text, minHeight: '100vh' }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 48px' }}>
        {state.status === 'loading' ? (
          <p style={{ color: palette.muted, textAlign: 'center', paddingTop: 80 }}>
            در حال بارگذاری…
          </p>
        ) : state.status === 'error' ? (
          <p style={{ color: palette.muted, textAlign: 'center', paddingTop: 80 }}>
            {state.message}
          </p>
        ) : (
          <EventContent
            data={state.data}
            slug={slug}
            eventSlug={eventSlug}
            accent={accent}
            palette={palette}
          />
        )}
      </div>
    </main>
  );
}

function EventContent({
  data,
  slug,
  eventSlug,
  accent,
  palette,
}: {
  data: PublicEventDetail;
  slug: string;
  eventSlug: string;
  accent: string;
  palette: { bg: string; card: string; text: string; muted: string; line: string };
}) {
  const { event, restaurant, spotsLeft } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ textAlign: 'center', color: palette.muted, fontSize: 14 }}>
        {restaurant.name}
      </div>

      {event.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.coverUrl}
          alt={event.title}
          style={{
            width: '100%',
            borderRadius: 16,
            border: `1px solid ${palette.line}`,
            objectFit: 'cover',
            maxHeight: 260,
          }}
        />
      ) : null}

      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
        <span style={{ borderBottom: `3px solid ${accent}`, paddingBottom: 4 }}>
          {event.title}
        </span>
      </h1>

      <div style={{ color: palette.muted, fontSize: 14 }}>
        {formatDateFa(event.startsAt)}
        {event.endsAt ? ` تا ${formatDateFa(event.endsAt)}` : ''}
      </div>

      {event.description ? (
        <p style={{ lineHeight: 2, whiteSpace: 'pre-wrap', margin: 0 }}>
          {event.description}
        </p>
      ) : null}

      {event.rsvpEnabled ? (
        <RsvpForm
          slug={slug}
          eventSlug={eventSlug}
          accent={accent}
          palette={palette}
          spotsLeft={spotsLeft}
        />
      ) : null}
    </div>
  );
}

function RsvpForm({
  slug,
  eventSlug,
  accent,
  palette,
  spotsLeft,
}: {
  slug: string;
  eventSlug: string;
  accent: string;
  palette: { bg: string; card: string; text: string; muted: string; line: string };
  spotsLeft: number | null;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState('1');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = spotsLeft != null && spotsLeft <= 0;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${palette.line}`,
    background: palette.bg,
    color: palette.text,
    fontSize: 14,
  };

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await publicEventService.rsvp(slug, eventSlug, {
        name,
        phone,
        guests: Number(guests.replace(/\D/g, '')) || 1,
        note: note.trim() || null,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ثبت‌نام انجام نشد.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        style={{
          background: palette.card,
          border: `1px solid ${palette.line}`,
          borderRadius: 16,
          padding: 20,
          textAlign: 'center',
        }}
      >
        <p style={{ fontWeight: 700, margin: 0 }}>ثبت‌نام شما ثبت شد ✅</p>
        <p style={{ color: palette.muted, fontSize: 14, marginTop: 6 }}>
          منتظرتان هستیم.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: palette.card,
        border: `1px solid ${palette.line}`,
        borderRadius: 16,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 700 }}>
        ثبت‌نام در رویداد
        {spotsLeft != null ? (
          <span style={{ color: palette.muted, fontWeight: 400, fontSize: 13 }}>
            {'  '}({spotsLeft} جای خالی)
          </span>
        ) : null}
      </div>

      {full ? (
        <p style={{ color: palette.muted, margin: 0 }}>ظرفیت این رویداد تکمیل شده است.</p>
      ) : (
        <>
          <input
            style={inputStyle}
            placeholder="نام و نام خانوادگی"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            style={{ ...inputStyle, direction: 'ltr' }}
            placeholder="09xxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            style={{ ...inputStyle, direction: 'ltr' }}
            inputMode="numeric"
            placeholder="تعداد نفرات"
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
          />
          <textarea
            style={{ ...inputStyle, resize: 'vertical' }}
            rows={2}
            placeholder="توضیح (اختیاری)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error ? (
            <p style={{ color: '#EF4444', fontSize: 13, margin: 0 }}>{error}</p>
          ) : null}
          <button
            onClick={submit}
            disabled={submitting}
            style={{
              padding: '11px 16px',
              borderRadius: 10,
              border: 'none',
              background: accent,
              color: '#0B0B0D',
              fontWeight: 700,
              fontSize: 15,
              cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'در حال ثبت…' : 'ثبت‌نام'}
          </button>
        </>
      )}
    </div>
  );
}
