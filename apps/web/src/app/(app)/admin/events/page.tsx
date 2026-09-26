'use client';

import { createEventSchema, updateEventSchema } from '@restaurant-os/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, QrCode as QrIcon, Trash2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  SkeletonList,
  Textarea,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { formatDateFa, toPersianDigits } from '@/lib/format';
import { eventService, storageService, type EventDto } from '@/services';

/** datetime-local wants `YYYY-MM-DDTHH:mm` in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function EventsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventDto | null>(null);
  const [deleting, setDeleting] = useState<EventDto | null>(null);
  const [qrEvent, setQrEvent] = useState<EventDto | null>(null);
  const [rsvpEvent, setRsvpEvent] = useState<EventDto | null>(null);

  const eventsQuery = useQuery({ queryKey: ['events'], queryFn: () => eventService.list() });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['events'] });

  const remove = useMutation({
    mutationFn: (id: string) => eventService.remove(id),
    onSuccess: () => {
      toast.success('رویداد حذف شد');
      setDeleting(null);
      invalidate();
    },
    onError: (error) =>
      toast.error('حذف انجام نشد', error instanceof ApiError ? error.message : undefined),
  });

  const events = eventsQuery.data ?? [];
  const manageable = can('settings:manage');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="رویدادها"
          description="شب موسیقی، رونمایی، ورک‌شاپ… هر رویداد صفحه و QR اختصاصی خودش را دارد."
          action={
            manageable ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="size-4" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                رویداد جدید
              </Button>
            ) : null
          }
        />
        <CardBody className="p-0">
          {eventsQuery.isPending ? (
            <div className="p-5">
              <SkeletonList rows={3} />
            </div>
          ) : eventsQuery.isError ? (
            <ErrorState onRetry={() => eventsQuery.refetch()} />
          ) : events.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-6" />}
              title="هنوز رویدادی ندارید"
              description="اولین رویداد کافه‌تان را بسازید و QR اختصاصی‌اش را چاپ کنید."
              action={
                manageable ? (
                  <Button variant="primary" onClick={() => setFormOpen(true)}>
                    ساخت اولین رویداد
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{event.title}</span>
                      {event.isActive ? (
                        <Badge tone="positive" dot>
                          فعال
                        </Badge>
                      ) : (
                        <Badge tone="neutral">غیرفعال</Badge>
                      )}
                      {event.rsvpEnabled ? <Badge tone="info">ثبت‌نام باز</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-subtle">
                      {formatDateFa(event.startsAt)}
                      {event.endsAt ? ` تا ${formatDateFa(event.endsAt)}` : ''}
                      {event.capacity != null
                        ? ` • ظرفیت ${toPersianDigits(event.capacity)}`
                        : ''}
                      {` • نشانی: /e/${event.slug}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<QrIcon className="size-4" />}
                      onClick={() => setQrEvent(event)}
                    >
                      QR
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Users className="size-4" />}
                      onClick={() => setRsvpEvent(event)}
                    >
                      ثبت‌نام‌ها
                    </Button>
                    {manageable ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(event);
                            setFormOpen(true);
                          }}
                        >
                          ویرایش
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="حذف"
                          onClick={() => setDeleting(event)}
                        >
                          <Trash2 className="size-4 text-critical" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <EventFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          invalidate();
        }}
      />

      {qrEvent ? <EventQrModal event={qrEvent} onClose={() => setQrEvent(null)} /> : null}
      {rsvpEvent ? (
        <EventRsvpsModal event={rsvpEvent} onClose={() => setRsvpEvent(null)} />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="حذف رویداد"
        message={`آیا از حذف رویداد «${deleting?.title}» مطمئن هستید؟`}
        confirmLabel="حذف کن"
        loading={remove.isPending}
      />
    </div>
  );
}

function EventFormModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: EventDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [theme, setTheme] = useState<'' | 'dark' | 'light'>('');
  const [capacity, setCapacity] = useState('');
  const [rsvpEnabled, setRsvpEnabled] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setSlug(editing.slug);
      setDescription(editing.description ?? '');
      setCoverUrl(editing.coverUrl);
      setStartsAt(toLocalInput(editing.startsAt));
      setEndsAt(toLocalInput(editing.endsAt));
      setAccentColor(editing.accentColor ?? '');
      setTheme((editing.theme as 'dark' | 'light' | null) ?? '');
      setCapacity(editing.capacity != null ? String(editing.capacity) : '');
      setRsvpEnabled(editing.rsvpEnabled);
      setIsActive(editing.isActive);
    } else {
      setTitle('');
      setSlug('');
      setDescription('');
      setCoverUrl(null);
      setStartsAt('');
      setEndsAt('');
      setAccentColor('');
      setTheme('');
      setCapacity('');
      setRsvpEnabled(false);
      setIsActive(true);
    }
    setErrors({});
  }, [open, editing]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const result = await storageService.uploadImage(file, 'events');
      setCoverUrl(result.url);
    } catch (error) {
      toast.error('آپلود تصویر انجام نشد', error instanceof ApiError ? error.message : undefined);
    } finally {
      setUploading(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        slug,
        description: description.trim() || null,
        coverUrl: coverUrl || null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : '',
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        accentColor: accentColor.trim() || null,
        theme: theme || null,
        capacity: capacity.trim() ? Number(capacity.replace(/\D/g, '')) : null,
        rsvpEnabled,
        isActive,
      };
      const schema = editing ? updateEventSchema : createEventSchema;
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          fieldErrors[String(issue.path[0])] = issue.message;
        }
        setErrors(fieldErrors);
        throw new Error('validation');
      }
      setErrors({});
      return editing
        ? eventService.update(editing.id, payload)
        : eventService.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'رویداد به‌روزرسانی شد' : 'رویداد ساخته شد');
      onSaved();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        toast.error('ذخیره انجام نشد', error.message);
        if (error.details) {
          setErrors(
            Object.fromEntries(
              Object.entries(error.details).map(([key, list]) => [key, list[0]]),
            ),
          );
        }
      }
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'ویرایش رویداد' : 'رویداد جدید'}
      description="نشانی رویداد در QR و لینک عمومی استفاده می‌شود."
      size="md"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="primary"
            fullWidth
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {editing ? 'ذخیره' : 'ساخت رویداد'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Input
          label="عنوان رویداد"
          placeholder="شب موسیقی زنده"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          required
        />
        <Input
          label="نشانی (slug)"
          dir="ltr"
          placeholder="live-music"
          hint="در آدرس عمومی /e/<این> استفاده می‌شود."
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          error={errors.slug}
          required
        />
        <Textarea
          label="توضیحات (اختیاری)"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />

        <div>
          <span className="mb-1.5 block text-sm text-ink-muted">تصویر کاور (اختیاری)</span>
          <div className="flex items-center gap-3">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt="کاور"
                className="size-16 rounded-lg border border-line object-cover"
              />
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {coverUrl ? 'تغییر تصویر' : 'انتخاب تصویر'}
            </Button>
            {coverUrl ? (
              <Button variant="ghost" size="sm" onClick={() => setCoverUrl(null)}>
                حذف
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="شروع"
            type="datetime-local"
            dir="ltr"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            error={errors.startsAt}
            required
          />
          <Input
            label="پایان (اختیاری)"
            type="datetime-local"
            dir="ltr"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            error={errors.endsAt}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="رنگ شاخص رویداد (اختیاری)"
            type="color"
            dir="ltr"
            hint="خالی یعنی همان رنگ رستوران"
            value={accentColor || '#0D7666'}
            onChange={(e) => setAccentColor(e.target.value)}
            error={errors.accentColor}
          />
          <Select
            label="تم صفحه رویداد"
            value={theme}
            onChange={(e) => setTheme(e.target.value as '' | 'dark' | 'light')}
            options={[
              { value: '', label: 'مثل رستوران' },
              { value: 'dark', label: 'تیره' },
              { value: 'light', label: 'روشن' },
            ]}
          />
        </div>

        <Input
          label="ظرفیت (اختیاری)"
          dir="ltr"
          inputMode="numeric"
          hint="خالی یعنی بدون محدودیت"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          error={errors.capacity}
        />

        <div className="flex flex-wrap gap-5 pt-1">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={rsvpEnabled}
              onChange={(e) => setRsvpEnabled(e.target.checked)}
            />
            ثبت‌نام (RSVP) باز باشد
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            فعال (روی صفحهٔ عمومی دیده شود)
          </label>
        </div>
      </div>
    </Modal>
  );
}

function EventQrModal({ event, onClose }: { event: EventDto; onClose: () => void }) {
  const toast = useToast();
  const qrQuery = useQuery({
    queryKey: ['event-qr', event.id],
    queryFn: () => eventService.qr(event.id),
  });

  return (
    <Modal open onClose={onClose} title={`QR رویداد «${event.title}»`} size="sm">
      <div className="flex flex-col items-center gap-4 py-2">
        {qrQuery.isPending ? (
          <p className="text-sm text-ink-muted">در حال ساخت…</p>
        ) : qrQuery.isError ? (
          <ErrorState onRetry={() => qrQuery.refetch()} />
        ) : qrQuery.data ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrQuery.data.dataUrl} alt="QR" className="size-56 rounded-xl" />
            <p className="ltr-nums text-xs text-ink-subtle">{qrQuery.data.targetPath}</p>
            <div className="flex gap-2">
              <a href={qrQuery.data.dataUrl} download={`event-${event.slug}.png`}>
                <Button variant="primary" size="sm">
                  دانلود
                </Button>
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(qrQuery.data.targetPath);
                  toast.success('نشانی کپی شد');
                }}
              >
                کپی نشانی
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function EventRsvpsModal({ event, onClose }: { event: EventDto; onClose: () => void }) {
  const rsvpsQuery = useQuery({
    queryKey: ['event-rsvps', event.id],
    queryFn: () => eventService.rsvps(event.id),
  });
  const data = rsvpsQuery.data;

  return (
    <Modal open onClose={onClose} title={`ثبت‌نام‌های «${event.title}»`} size="md">
      {rsvpsQuery.isPending ? (
        <SkeletonList rows={3} />
      ) : rsvpsQuery.isError ? (
        <ErrorState onRetry={() => rsvpsQuery.refetch()} />
      ) : data && data.items.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            {toPersianDigits(data.reserved)} نفر ثبت‌نام کرده‌اند
            {data.spotsLeft != null
              ? ` • ${toPersianDigits(data.spotsLeft)} جای خالی`
              : ''}
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                  <p className="ltr-nums text-xs text-ink-subtle">{r.phone}</p>
                </div>
                <Badge tone="neutral">{toPersianDigits(r.guests)} نفر</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState
          icon={<Users className="size-6" />}
          title="هنوز ثبت‌نامی نیست"
          description="وقتی مهمان‌ها از صفحهٔ رویداد ثبت‌نام کنند این‌جا دیده می‌شوند."
        />
      )}
    </Modal>
  );
}
