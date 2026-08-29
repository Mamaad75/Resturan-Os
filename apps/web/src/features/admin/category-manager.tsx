'use client';

import { createCategorySchema } from '@restaurant-os/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Modal,
  Switch,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { toPersianDigits } from '@/lib/format';
import { menuService, type AdminCategory } from '@/services';

interface CategoryForm {
  name: string;
  nameFa: string;
  description: string;
  isActive: boolean;
}

const EMPTY: CategoryForm = { name: '', nameFa: '', description: '', isActive: true };

/**
 * Category management.
 *
 * Ordering is edited with explicit up/down buttons rather than drag and drop:
 * the same control works with a mouse, a touch screen and a keyboard, and the
 * whole list is persisted in one `reorder` call.
 */
export function CategoryManagerModal({
  open,
  categories,
  onClose,
}: {
  open: boolean;
  categories: AdminCategory[];
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<AdminCategory[]>(categories);

  // Keep the local order in sync with the server list, but never while a
  // reorder is being composed - that would fight the user's clicks.
  useEffect(() => {
    if (open) setOrder(categories);
  }, [open, categories]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    void queryClient.invalidateQueries({ queryKey: ['pos-menu'] });
    void queryClient.invalidateQueries({ queryKey: ['onboarding'] });
  }

  function openForm(category: AdminCategory | null) {
    setErrors({});
    setEditing(category);
    setCreating(category === null);
    setForm(
      category
        ? {
            name: category.name,
            nameFa: category.nameFa,
            description: category.description ?? '',
            isActive: category.isActive,
          }
        : EMPTY,
    );
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim() || form.nameFa.trim(),
        nameFa: form.nameFa.trim(),
        description: form.description.trim() || null,
        isActive: form.isActive,
      };
      const parsed = createCategorySchema.safeParse(payload);
      if (!parsed.success) {
        setErrors(
          Object.fromEntries(
            parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
          ),
        );
        throw new Error('validation');
      }
      setErrors({});
      return editing
        ? menuService.updateCategory(editing.id, payload)
        : menuService.createCategory(payload);
    },
    onSuccess: (category) => {
      toast.success(editing ? 'دسته‌بندی به‌روزرسانی شد' : 'دسته‌بندی ساخته شد', category.nameFa);
      closeForm();
      invalidate();
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

  const remove = useMutation({
    mutationFn: (id: string) => menuService.deleteCategory(id),
    onSuccess: () => {
      toast.success('دسته‌بندی حذف شد');
      setDeleting(null);
      invalidate();
    },
    onError: (error) =>
      toast.error(
        'حذف انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const saveOrder = useMutation({
    mutationFn: () =>
      menuService.reorderCategories(
        order.map((category, index) => ({ id: category.id, displayOrder: index })),
      ),
    onSuccess: () => {
      toast.success('ترتیب دسته‌بندی‌ها ذخیره شد');
      invalidate();
    },
    onError: (error) =>
      toast.error(
        'ذخیره ترتیب انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  const orderChanged = order.some((category, index) => category.id !== categories[index]?.id);

  return (
    <>
      <Modal
        open={open && !creating && editing === null}
        onClose={onClose}
        title="دسته‌بندی‌های منو"
        description="ترتیب نمایش در منوی مشتری از بالا به پایین است."
        size="md"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} fullWidth>
              بستن
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={!orderChanged}
              loading={saveOrder.isPending}
              onClick={() => saveOrder.mutate()}
            >
              ذخیره ترتیب
            </Button>
          </div>
        }
      >
        <div className="space-y-3 pt-1">
          <Button
            variant="ghost"
            leftIcon={<FolderPlus className="size-4" />}
            onClick={() => openForm(null)}
            fullWidth
          >
            دسته‌بندی جدید
          </Button>

          <ul className="divide-y divide-line rounded-xl border border-line">
            {order.map((category, index) => (
              <li key={category.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="انتقال به بالا"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="text-ink-subtle transition-colors hover:text-ink disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="انتقال به پایین"
                    disabled={index === order.length - 1}
                    onClick={() => move(index, 1)}
                    className="text-ink-subtle transition-colors hover:text-ink disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">
                      {category.nameFa}
                    </span>
                    {category.isActive ? null : <Badge tone="caution">غیرفعال</Badge>}
                  </div>
                  <p className="text-xs text-ink-subtle">
                    {toPersianDigits(category.productCount)} محصول
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="ویرایش"
                  onClick={() => openForm(category)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف"
                  onClick={() => {
                    // The API only deletes empty categories; say so up front
                    // instead of letting the request fail.
                    if (category.productCount > 0) {
                      toast.error(
                        'این دسته خالی نیست',
                        `ابتدا ${toPersianDigits(category.productCount)} محصول را به دسته دیگری منتقل یا حذف کنید.`,
                      );
                      return;
                    }
                    setDeleting(category);
                  }}
                >
                  <Trash2 className="size-4 text-critical" />
                </Button>
              </li>
            ))}
          </ul>

          {order.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-ink-subtle">
              هنوز دسته‌بندی ندارید. برای شروع یکی بسازید.
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={creating || editing !== null}
        onClose={closeForm}
        title={editing ? 'ویرایش دسته‌بندی' : 'دسته‌بندی جدید'}
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" onClick={closeForm} fullWidth>
              انصراف
            </Button>
            <Button
              variant="primary"
              fullWidth
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              ذخیره
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pt-1">
          <Input
            label="نام فارسی"
            value={form.nameFa}
            onChange={(e) => setForm((f) => ({ ...f, nameFa: e.target.value }))}
            error={errors.nameFa}
            placeholder="نوشیدنی گرم"
            required
          />
          <Input
            label="نام انگلیسی"
            dir="ltr"
            hint="در صورت خالی بودن، از نام فارسی استفاده می‌شود"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
          />
          <Input
            label="توضیح کوتاه"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            error={errors.description}
          />
          <Switch
            checked={form.isActive}
            onChange={(value) => setForm((f) => ({ ...f, isActive: value }))}
            label="نمایش در منو"
            description="دسته غیرفعال برای مشتری دیده نمی‌شود، اما محصولاتش حفظ می‌شوند."
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="حذف دسته‌بندی"
        message={<>آیا از حذف «{deleting?.nameFa}» مطمئن هستید؟</>}
        confirmLabel="حذف کن"
        loading={remove.isPending}
      />
    </>
  );
}
