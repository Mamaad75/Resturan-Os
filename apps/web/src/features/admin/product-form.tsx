'use client';

import { createProductSchema } from '@restaurant-os/validation';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { menuService, type AdminCategory, type AdminProduct } from '@/services';

interface FormState {
  categoryId: string;
  name: string;
  nameFa: string;
  descriptionFa: string;
  price: string;
  discountPrice: string;
  preparationMinutes: string;
  calories: string;
  isAvailable: boolean;
  isFeatured: boolean;
}

const EMPTY: FormState = {
  categoryId: '',
  name: '',
  nameFa: '',
  descriptionFa: '',
  price: '',
  discountPrice: '',
  preparationMinutes: '',
  calories: '',
  isAvailable: true,
  isFeatured: false,
};

/**
 * Create/edit product.
 *
 * Validates against the same Zod schema the API enforces, so a mistake is
 * caught before the round trip; server-side field errors are still mapped back
 * onto the inputs if anything slips through.
 */
export function ProductFormModal({
  open,
  product,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: AdminProduct | null;
  categories: AdminCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      product
        ? {
            categoryId: product.categoryId,
            name: product.name,
            nameFa: product.nameFa,
            descriptionFa: product.descriptionFa ?? '',
            price: String(product.price),
            discountPrice:
              product.discountPrice != null ? String(product.discountPrice) : '',
            preparationMinutes:
              product.preparationMinutes != null
                ? String(product.preparationMinutes)
                : '',
            calories: product.calories != null ? String(product.calories) : '',
            isAvailable: product.isAvailable,
            isFeatured: product.isFeatured,
          }
        : { ...EMPTY, categoryId: categories[0]?.id ?? '' },
    );
  }, [open, product, categories]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        categoryId: form.categoryId,
        name: form.name.trim() || form.nameFa.trim(),
        nameFa: form.nameFa.trim(),
        descriptionFa: form.descriptionFa.trim() || null,
        price: Number(form.price.replace(/\D/g, '')) || 0,
        discountPrice: form.discountPrice.trim()
          ? Number(form.discountPrice.replace(/\D/g, ''))
          : null,
        preparationMinutes: form.preparationMinutes.trim()
          ? Number(form.preparationMinutes.replace(/\D/g, ''))
          : null,
        calories: form.calories.trim()
          ? Number(form.calories.replace(/\D/g, ''))
          : null,
        isAvailable: form.isAvailable,
        isFeatured: form.isFeatured,
      };

      const parsed = createProductSchema.safeParse(payload);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          fieldErrors[String(issue.path[0])] = issue.message;
        }
        setErrors(fieldErrors);
        throw new Error('validation');
      }
      setErrors({});

      return product
        ? menuService.updateProduct(product.id, payload)
        : menuService.createProduct(payload);
    },
    onSuccess: (saved) => {
      toast.success(product ? 'محصول به‌روزرسانی شد' : 'محصول ساخته شد', saved.nameFa);
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
      // A local validation failure has already populated the field errors.
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'ویرایش محصول' : 'محصول جدید'}
      description={product ? product.nameFa : 'محصول تازه به منو اضافه کنید'}
      size="lg"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} fullWidth>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="نام فارسی"
            value={form.nameFa}
            onChange={(e) => set('nameFa', e.target.value)}
            error={errors.nameFa}
            required
          />
          <Input
            label="نام انگلیسی"
            dir="ltr"
            hint="در صورت خالی بودن، از نام فارسی استفاده می‌شود"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
          />
        </div>

        <Select
          label="دسته‌بندی"
          value={form.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
          options={categories.map((category) => ({
            value: category.id,
            label: category.nameFa,
          }))}
          error={errors.categoryId}
          required
        />

        <Textarea
          label="توضیحات"
          rows={3}
          maxLength={1000}
          value={form.descriptionFa}
          onChange={(e) => set('descriptionFa', e.target.value)}
          error={errors.descriptionFa}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="قیمت"
            dir="ltr"
            inputMode="numeric"
            rightAddon="تومان"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
            error={errors.price}
            required
          />
          <Input
            label="قیمت با تخفیف"
            dir="ltr"
            inputMode="numeric"
            rightAddon="تومان"
            hint="باید کمتر از قیمت اصلی باشد"
            value={form.discountPrice}
            onChange={(e) => set('discountPrice', e.target.value)}
            error={errors.discountPrice}
          />
          <Input
            label="زمان آماده‌سازی"
            dir="ltr"
            inputMode="numeric"
            rightAddon="دقیقه"
            value={form.preparationMinutes}
            onChange={(e) => set('preparationMinutes', e.target.value)}
            error={errors.preparationMinutes}
          />
          <Input
            label="کالری"
            dir="ltr"
            inputMode="numeric"
            value={form.calories}
            onChange={(e) => set('calories', e.target.value)}
            error={errors.calories}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Switch
            checked={form.isAvailable}
            onChange={(value) => set('isAvailable', value)}
            label="موجود در منو"
            description="محصول ناموجود در منوی مشتری خاکستری نمایش داده می‌شود."
          />
          <Switch
            checked={form.isFeatured}
            onChange={(value) => set('isFeatured', value)}
            label="پیشنهاد ویژه"
            description="در بالای منوی مشتری برجسته می‌شود."
          />
        </div>

        {product && product.modifierGroups.length > 0 ? (
          <p className="rounded-xl border border-line bg-surface-sunken p-3 text-xs leading-relaxed text-ink-muted">
            این محصول {product.modifierGroups.length} گروه گزینه دارد (
            {product.modifierGroups.map((group) => group.nameFa).join('، ')}). ویرایش
            گزینه‌ها از طریق API در دسترس است و در نسخه بعدی به این فرم اضافه می‌شود.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
