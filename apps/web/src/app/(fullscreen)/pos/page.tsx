'use client';

import {
  ModifierGroupType,
  OrderStatus,
  RealtimeEvent,
  TableStatus,
  type PublicProduct,
  type TableDto,
} from '@restaurant-os/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Table2,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { WaiterCallBar } from '@/features/admin/waiter-call-bar';
import { useRealtime } from '@/hooks/use-realtime';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { formatMoney, toPersianDigits } from '@/lib/format';
import { menuService, orderService, tableService } from '@/services';

interface TicketLine {
  key: string;
  productId: string;
  nameFa: string;
  unitPrice: number;
  quantity: number;
  modifiers: Array<{ id: string; nameFa: string; priceDelta: number }>;
}

type OrderMode = 'DINE_IN' | 'TAKEAWAY';

/**
 * Counter / POS.
 *
 * Optimised for speed: categories on one side, a product grid in the middle,
 * the live ticket on the other. Search is focus-first so a cashier can type a
 * product name and hit enter without touching the screen.
 */
export default function PosPage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [mode, setMode] = useState<OrderMode>('DINE_IN');
  const [tableId, setTableId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [modifierProduct, setModifierProduct] = useState<PublicProduct | null>(null);

  const menuQuery = useQuery({
    queryKey: ['pos-menu'],
    queryFn: () => menuService.tree(),
    staleTime: 60_000,
  });

  const tablesQuery = useQuery({
    queryKey: ['pos-tables'],
    queryFn: () => tableService.list(),
    refetchInterval: 45_000,
  });

  const refreshTables = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
  }, [queryClient]);

  useRealtime({
    token: accessToken,
    handlers: {
      [RealtimeEvent.TABLE_UPDATED]: refreshTables,
      [RealtimeEvent.ORDER_STATUS_CHANGED]: refreshTables,
    },
  });

  // `/` focuses search from anywhere - a keyboard-first affordance for staff
  // who spend their whole shift on this screen.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') setSearch('');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const categories = menuQuery.data?.categories ?? [];
  const allProducts = useMemo(
    () => categories.flatMap((category) => category.products),
    [categories],
  );

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const pool =
      activeCategory === 'all'
        ? allProducts
        : (categories.find((c) => c.id === activeCategory)?.products ?? []);
    if (!term) return pool;
    return pool.filter(
      (product) =>
        product.nameFa.toLowerCase().includes(term) ||
        product.name.toLowerCase().includes(term),
    );
  }, [search, activeCategory, allProducts, categories]);

  const ticketTotal = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  function addProduct(
    product: PublicProduct,
    modifiers: Array<{ id: string; nameFa: string; priceDelta: number }> = [],
  ) {
    const key = `${product.id}|${modifiers.map((m) => m.id).sort().join('+')}`;
    const unitPrice =
      product.effectivePrice + modifiers.reduce((sum, m) => sum + m.priceDelta, 0);

    setLines((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key
            ? { ...line, quantity: Math.min(99, line.quantity + 1) }
            : line,
        );
      }
      return [
        ...current,
        {
          key,
          productId: product.id,
          nameFa: product.nameFa,
          unitPrice,
          quantity: 1,
          modifiers,
        },
      ];
    });
  }

  function onProductClick(product: PublicProduct) {
    if (!product.isAvailable) return;
    // Products with required choices need the modifier dialog first.
    const needsChoice = product.modifierGroups.some(
      (group) => group.isRequired || group.minSelect > 0,
    );
    if (needsChoice) {
      setModifierProduct(product);
      return;
    }
    addProduct(product);
  }

  const createOrder = useMutation({
    mutationFn: (sendToKitchen: boolean) =>
      orderService.create({
        type: mode,
        tableId: mode === 'DINE_IN' ? tableId : null,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        sendToKitchen,
        discountAmount: 0,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          modifierOptionIds: line.modifiers.map((m) => m.id),
        })),
      }),
    onSuccess: (result) => {
      toast.success(
        `سفارش #${toPersianDigits(result.order.orderNumber)} ثبت شد`,
        formatMoney(result.order.total),
      );
      setLines([]);
      setTableId(null);
      setCustomerName('');
      setCustomerPhone('');
      setCartOpen(false);
      refreshTables();
      router.push(`/admin/orders/${result.order.id}`);
    },
    onError: (error) => {
      toast.error(
        'ثبت سفارش انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      );
    },
  });

  const canSubmit =
    lines.length > 0 &&
    (mode === 'TAKEAWAY' ? customerName.trim().length > 0 : tableId !== null);

  const selectedTable = tablesQuery.data?.find((table) => table.id === tableId);

  const ticketPanel = (
    <TicketPanel
      lines={lines}
      total={ticketTotal}
      mode={mode}
      onModeChange={setMode}
      selectedTable={selectedTable}
      onPickTable={() => setTablePickerOpen(true)}
      customerName={customerName}
      onCustomerNameChange={setCustomerName}
      customerPhone={customerPhone}
      onCustomerPhoneChange={setCustomerPhone}
      onSetQuantity={(key, quantity) =>
        setLines((current) =>
          quantity <= 0
            ? current.filter((line) => line.key !== key)
            : current.map((line) =>
                line.key === key ? { ...line, quantity } : line,
              ),
        )
      }
      onClear={() => setLines([])}
      canSubmit={canSubmit}
      submitting={createOrder.isPending}
      onSubmit={(sendToKitchen) => createOrder.mutate(sendToKitchen)}
    />
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowRight className="size-5" />
        </Link>
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-5 text-gold" />
          <h1 className="text-lg font-bold text-ink">صندوق</h1>
        </div>

        <div className="ms-auto w-full max-w-sm">
          <Input
            ref={searchRef}
            placeholder="جستجوی محصول…  (کلید /)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftAddon={<Search className="size-4" />}
            rightAddon={
              search ? (
                <button onClick={() => setSearch('')} aria-label="پاک کردن">
                  <X className="size-4" />
                </button>
              ) : null
            }
            containerClassName="w-full"
          />
        </div>
      </header>

      <WaiterCallBar />

      <div className="flex min-h-0 flex-1">
        {/* Categories: a rail on desktop, a horizontal strip on mobile. */}
        <nav className="hidden w-44 shrink-0 overflow-y-auto border-e border-line bg-surface p-2 lg:block">
          <CategoryButton
            active={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
            label="همه"
            count={allProducts.length}
          />
          {categories.map((category) => (
            <CategoryButton
              key={category.id}
              active={activeCategory === category.id}
              onClick={() => setActiveCategory(category.id)}
              label={category.nameFa}
              count={category.products.length}
            />
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto p-3">
          <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto lg:hidden">
            <ChipButton
              active={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
              label="همه"
            />
            {categories.map((category) => (
              <ChipButton
                key={category.id}
                active={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
                label={category.nameFa}
              />
            ))}
          </div>

          {menuQuery.isPending ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed className="size-6" />}
              title={search ? 'محصولی پیدا نشد' : 'این دسته خالی است'}
              description={
                search
                  ? `نتیجه‌ای برای «${search}» یافت نشد.`
                  : 'محصولی در این دسته‌بندی ثبت نشده است.'
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => onProductClick(product)}
                  disabled={!product.isAvailable}
                  className={cn(
                    'flex h-28 flex-col justify-between rounded-xl border p-3 text-start transition-colors',
                    product.isAvailable
                      ? 'border-line bg-surface hover:border-gold/50 hover:bg-surface-raised active:scale-[0.98]'
                      : 'cursor-not-allowed border-line bg-surface-sunken opacity-50',
                  )}
                >
                  <span className="line-clamp-2 text-sm font-medium leading-snug text-ink">
                    {product.nameFa}
                  </span>
                  <span className="text-sm font-semibold text-gold">
                    {formatMoney(product.effectivePrice, 'IRT', { withUnit: false })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </main>

        {/* Ticket rail (desktop) */}
        <aside className="hidden w-96 shrink-0 border-s border-line bg-surface xl:flex xl:flex-col">
          {ticketPanel}
        </aside>
      </div>

      {/* Ticket as a bottom bar + sheet (mobile / tablet) */}
      {lines.length > 0 ? (
        <button
          onClick={() => setCartOpen(true)}
          className="flex items-center justify-between gap-3 border-t border-line bg-gold px-5 py-4 text-ink-inverse xl:hidden"
        >
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-full bg-black/15 text-sm tabular-nums">
              {toPersianDigits(itemCount)}
            </span>
            مشاهده سفارش
          </span>
          <span className="font-bold">{formatMoney(ticketTotal)}</span>
        </button>
      ) : null}

      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="سفارش جاری"
        size="md"
      >
        <div className="-mx-5">{ticketPanel}</div>
      </Modal>

      <TablePicker
        open={tablePickerOpen}
        onClose={() => setTablePickerOpen(false)}
        tables={tablesQuery.data ?? []}
        onSelect={(id) => {
          setTableId(id);
          setMode('DINE_IN');
          setTablePickerOpen(false);
        }}
      />

      <ModifierPicker
        product={modifierProduct}
        open={modifierProduct !== null}
        onClose={() => setModifierProduct(null)}
        onConfirm={(product, modifiers) => {
          addProduct(product, modifiers);
          setModifierProduct(null);
        }}
      />
    </div>
  );
}

function CategoryButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-gold/12 text-gold'
          : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
      )}
    >
      {label}
      <span className="text-xs tabular-nums opacity-70">{toPersianDigits(count)}</span>
    </button>
  );
}

function ChipButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
        active ? 'bg-gold text-ink-inverse' : 'bg-surface-raised text-ink-muted',
      )}
    >
      {label}
    </button>
  );
}

function TicketPanel({
  lines,
  total,
  mode,
  onModeChange,
  selectedTable,
  onPickTable,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  onSetQuantity,
  onClear,
  canSubmit,
  submitting,
  onSubmit,
}: {
  lines: TicketLine[];
  total: number;
  mode: OrderMode;
  onModeChange: (mode: OrderMode) => void;
  selectedTable?: TableDto;
  onPickTable: () => void;
  customerName: string;
  onCustomerNameChange: (value: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (value: string) => void;
  onSetQuantity: (key: string, quantity: number) => void;
  onClear: () => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: (sendToKitchen: boolean) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line p-3">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => onModeChange('DINE_IN')}
            className={cn(
              'rounded-lg py-2 text-sm font-medium transition-colors',
              mode === 'DINE_IN'
                ? 'bg-gold text-ink-inverse'
                : 'bg-surface-sunken text-ink-muted',
            )}
          >
            سرو در محل
          </button>
          <button
            onClick={() => onModeChange('TAKEAWAY')}
            className={cn(
              'rounded-lg py-2 text-sm font-medium transition-colors',
              mode === 'TAKEAWAY'
                ? 'bg-gold text-ink-inverse'
                : 'bg-surface-sunken text-ink-muted',
            )}
          >
            بیرون‌بر
          </button>
        </div>

        {mode === 'DINE_IN' ? (
          <Button
            variant={selectedTable ? 'secondary' : 'outline'}
            fullWidth
            onClick={onPickTable}
            leftIcon={<Table2 className="size-4" />}
          >
            {selectedTable
              ? `میز ${toPersianDigits(selectedTable.number)}`
              : 'انتخاب میز'}
          </Button>
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="نام مشتری"
              value={customerName}
              onChange={(e) => onCustomerNameChange(e.target.value)}
            />
            <Input
              placeholder="شماره موبایل (اختیاری)"
              dir="ltr"
              inputMode="numeric"
              value={customerPhone}
              onChange={(e) => onCustomerPhoneChange(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="size-5" />}
            title="سفارش خالی است"
            description="برای افزودن، روی محصولات ضربه بزنید."
            className="py-12"
          />
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{line.nameFa}</p>
                  {line.modifiers.length > 0 ? (
                    <p className="truncate text-xs text-ink-muted">
                      {line.modifiers.map((m) => m.nameFa).join('، ')}
                    </p>
                  ) : null}
                  <p className="text-xs text-ink-subtle">
                    {formatMoney(line.unitPrice, 'IRT', { withUnit: false })}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5">
                  <button
                    onClick={() => onSetQuantity(line.key, line.quantity - 1)}
                    className="flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised"
                    aria-label={line.quantity === 1 ? 'حذف' : 'کاهش'}
                  >
                    {line.quantity === 1 ? (
                      <Trash2 className="size-3.5 text-critical" />
                    ) : (
                      <Minus className="size-3.5" />
                    )}
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">
                    {toPersianDigits(line.quantity)}
                  </span>
                  <button
                    onClick={() => onSetQuantity(line.key, line.quantity + 1)}
                    className="flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-raised"
                    aria-label="افزایش"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                <span className="w-20 shrink-0 text-end text-sm font-semibold tabular-nums text-ink">
                  {formatMoney(line.unitPrice * line.quantity, 'IRT', {
                    withUnit: false,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">جمع اقلام</span>
          <span className="text-lg font-bold text-gold">{formatMoney(total)}</span>
        </div>
        <p className="text-[0.7rem] text-ink-subtle">
          مالیات و حق سرویس هنگام ثبت، توسط سرور محاسبه می‌شود.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            disabled={!canSubmit || submitting}
            onClick={() => onSubmit(false)}
          >
            نگه‌داشتن
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            loading={submitting}
            onClick={() => onSubmit(true)}
          >
            ارسال به آشپزخانه
          </Button>
        </div>
        {lines.length > 0 ? (
          <Button variant="ghost" fullWidth size="sm" onClick={onClear}>
            پاک کردن سفارش
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TablePicker({
  open,
  onClose,
  tables,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  tables: TableDto[];
  onSelect: (id: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="انتخاب میز" size="lg">
      {tables.length === 0 ? (
        <EmptyState title="میزی تعریف نشده" description="ابتدا در بخش میزها، میز اضافه کنید." />
      ) : (
        <div className="grid grid-cols-4 gap-2 pt-2 sm:grid-cols-6">
          {tables.map((table) => {
            const disabled = table.status === TableStatus.DISABLED;
            return (
              <button
                key={table.id}
                disabled={disabled}
                onClick={() => onSelect(table.id)}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center rounded-xl border-2 text-sm font-bold transition-colors',
                  table.status === TableStatus.AVAILABLE &&
                    'border-positive/40 bg-positive/[0.08] text-positive hover:border-positive',
                  table.status === TableStatus.OCCUPIED &&
                    'border-gold/40 bg-gold/[0.08] text-gold hover:border-gold',
                  table.status === TableStatus.WAITING_PAYMENT &&
                    'border-caution/40 bg-caution/[0.08] text-caution',
                  table.status === TableStatus.RESERVED &&
                    'border-info/40 bg-info/[0.08] text-info',
                  disabled && 'cursor-not-allowed border-line bg-surface-sunken text-ink-subtle',
                )}
              >
                {toPersianDigits(table.number)}
                <span className="mt-0.5 text-[0.65rem] font-normal opacity-80">
                  {toPersianDigits(table.capacity)} نفره
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/** Modifier chooser for POS: same rules as the customer sheet, fewer taps. */
function ModifierPicker({
  product,
  open,
  onClose,
  onConfirm,
}: {
  product: PublicProduct | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (
    product: PublicProduct,
    modifiers: Array<{ id: string; nameFa: string; priceDelta: number }>,
  ) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [lastId, setLastId] = useState<string | null>(null);

  if (product && product.id !== lastId) {
    setLastId(product.id);
    setSelected(
      Object.fromEntries(
        product.modifierGroups.map((group) => [
          group.id,
          group.isRequired && group.type === ModifierGroupType.SINGLE
            ? ([group.options.find((o) => o.isAvailable)?.id].filter(
                Boolean,
              ) as string[])
            : [],
        ]),
      ),
    );
  }

  if (!product) return null;

  const valid = product.modifierGroups.every((group) => {
    const count = selected[group.id]?.length ?? 0;
    const min = group.isRequired ? Math.max(group.minSelect, 1) : group.minSelect;
    const max = group.type === ModifierGroupType.SINGLE ? 1 : group.maxSelect;
    return count >= min && count <= max;
  });

  const chosen = product.modifierGroups.flatMap((group) =>
    group.options
      .filter((option) => (selected[group.id] ?? []).includes(option.id))
      .map((option) => ({
        id: option.id,
        nameFa: option.nameFa,
        priceDelta: option.priceDelta,
      })),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product.nameFa}
      size="md"
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!valid}
          onClick={() => onConfirm(product, chosen)}
        >
          افزودن •{' '}
          {formatMoney(
            product.effectivePrice + chosen.reduce((s, m) => s + m.priceDelta, 0),
          )}
        </Button>
      }
    >
      <div className="space-y-4 pt-1">
        {product.modifierGroups.map((group) => (
          <fieldset key={group.id}>
            <legend className="mb-2 text-sm font-semibold text-ink">
              {group.nameFa}
              {group.isRequired ? (
                <Badge tone="gold" className="ms-2">
                  الزامی
                </Badge>
              ) : null}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {group.options.map((option) => {
                const checked = (selected[group.id] ?? []).includes(option.id);
                return (
                  <button
                    key={option.id}
                    disabled={!option.isAvailable}
                    onClick={() =>
                      setSelected((current) => {
                        const existing = current[group.id] ?? [];
                        if (group.type === ModifierGroupType.SINGLE) {
                          return { ...current, [group.id]: [option.id] };
                        }
                        return {
                          ...current,
                          [group.id]: existing.includes(option.id)
                            ? existing.filter((id) => id !== option.id)
                            : [...existing, option.id],
                        };
                      })
                    }
                    className={cn(
                      'rounded-xl border p-3 text-start text-sm transition-colors',
                      checked
                        ? 'border-gold/50 bg-gold/[0.08] text-ink'
                        : 'border-line bg-surface-sunken text-ink-muted',
                      !option.isAvailable && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    <span className="block font-medium">{option.nameFa}</span>
                    {option.priceDelta > 0 ? (
                      <span className="text-xs text-ink-subtle">
                        + {formatMoney(option.priceDelta, 'IRT', { withUnit: false })}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}
