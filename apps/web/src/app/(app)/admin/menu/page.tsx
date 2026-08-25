'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  SegmentedControl,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ProductFormModal } from '@/features/admin/product-form';
import { ApiError } from '@/lib/api-client';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { menuService, type AdminProduct } from '@/services';

export default function MenuPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => menuService.categories(),
  });

  const productsQuery = useQuery({
    queryKey: ['admin-products', categoryFilter, search],
    queryFn: () =>
      menuService.products({
        pageSize: 200,
        categoryId: categoryFilter === 'all' ? undefined : categoryFilter,
        search: search.trim() || undefined,
      }),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    void queryClient.invalidateQueries({ queryKey: ['pos-menu'] });
  }

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      menuService.setAvailability(id, isAvailable),
    onSuccess: (product) => {
      toast.success(
        product.isAvailable
          ? `«${product.nameFa}» موجود شد`
          : `«${product.nameFa}» ناموجود شد`,
      );
      invalidate();
    },
    onError: (error) =>
      toast.error(
        'تغییر وضعیت انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const removeProduct = useMutation({
    mutationFn: (id: string) => menuService.deleteProduct(id),
    onSuccess: () => {
      toast.success('محصول حذف شد');
      setDeleting(null);
      invalidate();
    },
    onError: (error) =>
      toast.error(
        'حذف انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const categories = categoriesQuery.data ?? [];
  const products = productsQuery.data?.items ?? [];

  const filterItems = useMemo(
    () => [
      { id: 'all', label: 'همه' },
      ...categories.map((category) => ({ id: category.id, label: category.nameFa })),
    ],
    [categories],
  );

  const editable = can('product:manage');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl
          items={filterItems}
          activeId={categoryFilter}
          onChange={setCategoryFilter}
        />
        <div className="flex gap-2">
          <Input
            placeholder="جستجوی محصول"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftAddon={<Search className="size-4" />}
            containerClassName="flex-1 lg:w-64"
          />
          {editable ? (
            <Button
              variant="primary"
              leftIcon={<Plus className="size-4" />}
              onClick={() => setCreating(true)}
              className="shrink-0"
            >
              محصول جدید
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader
          title="محصولات"
          description={`${toPersianDigits(products.length)} محصول`}
        />
        <CardBody className="p-0">
          {productsQuery.isPending ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : productsQuery.isError ? (
            <ErrorState onRetry={() => productsQuery.refetch()} />
          ) : products.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed className="size-6" />}
              title={search ? 'محصولی پیدا نشد' : 'محصولی ثبت نشده'}
              description={
                search
                  ? `نتیجه‌ای برای «${search}» یافت نشد.`
                  : 'اولین محصول منوی خود را اضافه کنید تا در منوی مشتری نمایش داده شود.'
              }
              action={
                editable && !search ? (
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    افزودن محصول
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {products.map((product) => (
                <li
                  key={product.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{product.nameFa}</span>
                      {product.isFeatured ? <Badge tone="gold">ویژه</Badge> : null}
                      {product.modifierGroups.length > 0 ? (
                        <Badge tone="neutral">
                          {toPersianDigits(product.modifierGroups.length)} گروه گزینه
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-subtle">
                      {product.categoryNameFa}
                      {product.descriptionFa ? ` • ${product.descriptionFa}` : ''}
                    </p>
                  </div>

                  <div className="text-end">
                    <p className="font-semibold tabular-nums text-gold">
                      {formatMoney(product.effectivePrice, 'IRT', { withUnit: false })}
                    </p>
                    {product.discountPrice != null ? (
                      <p className="text-xs text-ink-subtle line-through">
                        {formatMoney(product.price, 'IRT', { withUnit: false })}
                      </p>
                    ) : null}
                  </div>

                  {editable ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          toggleAvailability.mutate({
                            id: product.id,
                            isAvailable: !product.isAvailable,
                          })
                        }
                        className={
                          product.isAvailable
                            ? 'rounded-lg border border-positive/30 bg-positive/10 px-2.5 py-1.5 text-xs text-positive'
                            : 'rounded-lg border border-caution/30 bg-caution/10 px-2.5 py-1.5 text-xs text-caution'
                        }
                      >
                        {product.isAvailable ? 'موجود' : 'ناموجود'}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="ویرایش"
                        onClick={() => setEditing(product)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="حذف"
                        onClick={() => setDeleting(product)}
                      >
                        <Trash2 className="size-4 text-critical" />
                      </Button>
                    </div>
                  ) : (
                    <Badge tone={product.isAvailable ? 'positive' : 'caution'}>
                      {product.isAvailable ? 'موجود' : 'ناموجود'}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <ProductFormModal
        open={creating || editing !== null}
        product={editing}
        categories={categories}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          invalidate();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeProduct.mutate(deleting.id)}
        title="حذف محصول"
        message={
          <>
            آیا از حذف «{deleting?.nameFa}» مطمئن هستید؟ سفارش‌های گذشته حفظ می‌شوند،
            اما محصول از منو حذف خواهد شد.
          </>
        }
        confirmLabel="حذف کن"
        loading={removeProduct.isPending}
      />
    </div>
  );
}
