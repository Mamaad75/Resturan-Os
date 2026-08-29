'use client';

import { createProductSchema } from '@restaurant-os/validation';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Button,
  ImageUpload,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  ModifierEditor,
  toDraftGroups,
  toModifierPayload,
  type DraftGroup,
} from '@/features/admin/modifier-editor';
import { ApiError } from '@/lib/api-client';
import { menuService, type AdminCategory, type AdminProduct } from '@/services';

interface FormState {
  categoryId: string;
  name: string;
  nameFa: string;
  descriptionFa: string;
  imageUrl: string | null;
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
  imageUrl: null,
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
  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setGroups(product ? toDraftGroups(product.modifierGroups) : []);
    setForm(
      product
        ? {
            categoryId: product.categoryId,
            name: product.name,
            nameFa: product.nameFa,
            descriptionFa: product.descriptionFa ?? '',
            imageUrl: product.imageUrl,
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
        imageUrl: form.imageUrl,
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
        // Always sent, so clearing every group on an existing product actually
        // removes them rather than silently keeping the old ones.
        modifierGroups: toModifierPayload(groups),
      };

      const parsed = createProductSchema.safeParse(payload);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          // Group and option problems are reported against one banner rather
          // than a path the editor cannot address field-by-field.
          const key =
            issue.path[0] === 'modifierGroups'
              ? 'modifierGroups'
              : String(issue.path[0]);
          const prefix =
            key === 'modifierGroups' && typeof issue.path[1] === 'number'
              ? `گروه ${issue.path[1] + 1}: `
              : '';
          fieldErrors[key] ??= `${prefix}${issue.message}`;
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
            disabled={categories.length === 0}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            ذخیره
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {categories.length === 0 ? (
          <p className="rounded-xl border border-caution/30 bg-caution/10 p-3 text-xs leading-relaxed text-caution">
            هنوز دسته‌بندی نساخته‌اید. هر محصول باید در یک دسته قرار بگیرد — ابتدا از
            دکمه «دسته‌بندی‌ها» یک دسته بسازید.
          </p>
        ) : null}

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

        <ImageUpload
          value={form.imageUrl}
          onChange={(url) => set('imageUrl', url)}
          folder="products"
          label="تصویر محصول"
          hint="تصویر مربعی بهترین نتیجه را در منوی مشتری می‌دهد."
        />

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

        <div className="border-t border-line pt-4">
          <ModifierEditor groups={groups} onChange={setGroups} errors={errors} />
        </div>
      </div>
    </Modal>
  );
}
