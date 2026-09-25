'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, PackagePlus, RefreshCw, Truck, Warehouse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Card, CardBody, CardHeader, EmptyState, Input, Select, Switch, useToast } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { inventoryService, menuService, restaurantService } from '@/services';

const number = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => `${number(v).toLocaleString('fa-IR')} تومان`;

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const editable = can('inventory:manage');
  const restaurant = useQuery({ queryKey: ['restaurant'], queryFn: () => restaurantService.get() });
  const branchId = restaurant.data?.branches[0]?.id;
  const summary = useQuery({ queryKey: ['inventory-summary', branchId], queryFn: () => inventoryService.summary(branchId), enabled: !!branchId });
  const items = useQuery({ queryKey: ['inventory-items', branchId], queryFn: () => inventoryService.items(branchId), enabled: !!branchId });
  const warehouses = useQuery({ queryKey: ['inventory-warehouses', branchId], queryFn: () => inventoryService.warehouses(branchId), enabled: !!branchId });
  const suppliers = useQuery({ queryKey: ['inventory-suppliers'], queryFn: () => inventoryService.suppliers() });
  const pos = useQuery({ queryKey: ['inventory-pos', branchId], queryFn: () => inventoryService.purchaseOrders(branchId), enabled: !!branchId });
  const movements = useQuery({ queryKey: ['inventory-movements', branchId], queryFn: () => inventoryService.movements(branchId), enabled: !!branchId });
  const products = useQuery({ queryKey: ['inventory-products', branchId], queryFn: () => menuService.products({ branchId, page: 1, pageSize: 200 }), enabled: !!branchId });

  const invalidate = async () => {
    await Promise.all(['inventory-summary','inventory-items','inventory-warehouses','inventory-suppliers','inventory-pos','inventory-movements'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  };
  const action = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => { await invalidate(); toast.success('انبار به‌روزرسانی شد'); },
    onError: (e) => toast.error('عملیات انبار انجام نشد', e instanceof Error ? e.message : undefined),
  });

  const [newItem, setNewItem] = useState({ name: '', sku: '', unit: 'عدد', unitCost: '0', initialQuantity: '0', lowStockThreshold: '0', trackStock: true });
  const [adjust, setAdjust] = useState({ itemId: '', quantityDelta: '', reason: 'MANUAL_ADJUSTMENT', note: '' });
  const [warehouseName, setWarehouseName] = useState('');
  const [supplier, setSupplier] = useState({ name: '', phone: '' });
  const [po, setPo] = useState({ supplierId: '', itemId: '', quantity: '1', unitCost: '0' });
  const [recipeProductId, setRecipeProductId] = useState('');
  const [recipeRows, setRecipeRows] = useState<Array<{ itemId: string; quantity: string }>>([{ itemId: '', quantity: '1' }]);

  const summaryData = summary.data as { totalItems?: number; lowStockCount?: number; stockValue?: number; lowStockItems?: Array<{ id: string; name: string; quantity: number; unit: string }> } | undefined;
  const supplierRows = (suppliers.data ?? []) as Array<{ id: string; name: string; phone?: string | null }>;
  const poRows = (pos.data ?? []) as Array<{ id: string; number: string; status: string; supplier?: { name?: string } | null; items?: Array<{ itemId: string; quantity: number; receivedQuantity: number; unitCost: number; item?: { name?: string; unit?: string } }> }>;
  const movementRows = (movements.data ?? []) as Array<{ id: string; type: string; quantity: number; reference?: string | null; createdAt: string; item?: { name?: string } }>;
  const productRows = products.data?.items ?? [];

  const lowIds = useMemo(() => new Set((summaryData?.lowStockItems ?? []).map((x) => x.id)), [summaryData]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">انبارداری</h1>
        <p className="text-sm text-ink-muted">موجودی واقعی، Recipe/BOM، خرید، دریافت، انتقال، ضایعات و مصرف خودکار سفارش.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={Boxes} label="اقلام فعال" value={(summaryData?.totalItems ?? 0).toLocaleString('fa-IR')} />
        <Metric icon={AlertTriangle} label="کمبود موجودی" value={(summaryData?.lowStockCount ?? 0).toLocaleString('fa-IR')} critical={(summaryData?.lowStockCount ?? 0) > 0} />
        <Metric icon={Warehouse} label="ارزش موجودی" value={money(summaryData?.stockValue)} />
      </div>

      <Card>
        <CardHeader title="مواد اولیه و اقلام" description="موجودی هر ماده از طریق Recipe محصول هنگام ارسال سفارش به آشپزخانه کم می‌شود." />
        <CardBody className="space-y-4">
          {editable ? (
            <div className="grid gap-2 md:grid-cols-7">
              <Input placeholder="نام" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
              <Input placeholder="SKU" value={newItem.sku} onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })} />
              <Input placeholder="واحد" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} />
              <Input placeholder="قیمت واحد" dir="ltr" value={newItem.unitCost} onChange={(e) => setNewItem({ ...newItem, unitCost: e.target.value })} />
              <Input placeholder="موجودی اولیه" dir="ltr" value={newItem.initialQuantity} onChange={(e) => setNewItem({ ...newItem, initialQuantity: e.target.value })} />
              <Input placeholder="حد هشدار" dir="ltr" value={newItem.lowStockThreshold} onChange={(e) => setNewItem({ ...newItem, lowStockThreshold: e.target.value })} />
              <Button disabled={!newItem.name.trim()} onClick={() => action.mutate(() => inventoryService.createItem({ branchId, name: newItem.name, sku: newItem.sku || null, unit: newItem.unit, unitCost: number(newItem.unitCost), initialQuantity: number(newItem.initialQuantity), lowStockThreshold: number(newItem.lowStockThreshold), trackStock: newItem.trackStock }))}><PackagePlus className="size-4" />افزودن</Button>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-sunken text-ink-muted"><tr><th className="p-3 text-start">قلم</th><th>SKU</th><th>موجودی</th><th>حد هشدار</th><th>قیمت واحد</th><th>ارزش</th></tr></thead>
              <tbody>{(items.data ?? []).map((item) => <tr key={item.id} className="border-t border-line"><td className="p-3 font-medium text-ink">{item.name}{lowIds.has(item.id) ? <span className="ms-2 text-xs text-critical">کمبود</span> : null}</td><td className="text-center text-ink-muted">{item.sku ?? '—'}</td><td className="text-center">{item.quantity.toLocaleString('fa-IR')} {item.unit}</td><td className="text-center">{item.lowStockThreshold.toLocaleString('fa-IR')}</td><td className="text-center">{money(item.unitCost)}</td><td className="text-center">{money(item.stockValue)}</td></tr>)}</tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {editable ? <Card>
        <CardHeader title="گردش و اصلاح موجودی" description="برای ورود، ضایعات، شمارش دوره‌ای و اصلاح دستی از مقدار مثبت یا منفی استفاده کنید." />
        <CardBody className="grid gap-3 md:grid-cols-5">
          <Select value={adjust.itemId} onChange={(e) => setAdjust({ ...adjust, itemId: e.target.value })}><option value="">انتخاب قلم</option>{(items.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select>
          <Input dir="ltr" placeholder="+10 یا -2" value={adjust.quantityDelta} onChange={(e) => setAdjust({ ...adjust, quantityDelta: e.target.value })} />
          <Select value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}><option value="MANUAL_ADJUSTMENT">اصلاح دستی</option><option value="WASTE">ضایعات</option><option value="STOCKTAKE">انبارگردانی</option><option value="PURCHASE_RECEIPT">ورود خرید</option></Select>
          <Input placeholder="یادداشت" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
          <Button disabled={!adjust.itemId || !adjust.quantityDelta} onClick={() => action.mutate(() => inventoryService.adjust({ branchId, itemId: adjust.itemId, quantityDelta: number(adjust.quantityDelta), reason: adjust.reason, note: adjust.note || null }))}><RefreshCw className="size-4" />ثبت گردش</Button>
        </CardBody>
      </Card> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card><CardHeader title="انبارهای شعبه" /><CardBody className="space-y-3">
          {(warehouses.data ?? []).map((w) => <div key={w.id} className="flex items-center justify-between rounded-xl border border-line p-3"><span>{w.name}</span><span className="text-xs text-ink-muted">{w.isDefault ? 'پیش‌فرض' : 'انبار'}</span></div>)}
          {editable ? <div className="flex gap-2"><Input placeholder="نام انبار جدید" value={warehouseName} onChange={(e) => setWarehouseName(e.target.value)} /><Button disabled={!warehouseName.trim()} onClick={() => action.mutate(() => inventoryService.createWarehouse({ branchId, name: warehouseName, isDefault: false }))}>افزودن</Button></div> : null}
        </CardBody></Card>
        <Card><CardHeader title="تأمین‌کنندگان" /><CardBody className="space-y-3">
          {supplierRows.map((s) => <div key={s.id} className="flex justify-between rounded-xl border border-line p-3"><span>{s.name}</span><span className="text-xs text-ink-muted" dir="ltr">{s.phone ?? '—'}</span></div>)}
          {editable ? <div className="grid grid-cols-[1fr_1fr_auto] gap-2"><Input placeholder="نام تأمین‌کننده" value={supplier.name} onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} /><Input placeholder="تلفن" dir="ltr" value={supplier.phone} onChange={(e) => setSupplier({ ...supplier, phone: e.target.value })} /><Button disabled={!supplier.name.trim()} onClick={() => action.mutate(() => inventoryService.createSupplier({ name: supplier.name, phone: supplier.phone || null }))}><Truck className="size-4" />ثبت</Button></div> : null}
        </CardBody></Card>
      </div>

      <Card><CardHeader title="سفارش خرید و دریافت کالا" description="با دریافت جزئی یا کامل، موجودی و قیمت واحد به‌صورت تراکنشی به‌روزرسانی می‌شود." /><CardBody className="space-y-4">
        {editable ? <div className="grid gap-2 md:grid-cols-5"><Select value={po.supplierId} onChange={(e) => setPo({ ...po, supplierId: e.target.value })}><option value="">بدون تأمین‌کننده</option>{supplierRows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select><Select value={po.itemId} onChange={(e) => setPo({ ...po, itemId: e.target.value })}><option value="">انتخاب قلم</option>{(items.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select><Input dir="ltr" placeholder="تعداد" value={po.quantity} onChange={(e) => setPo({ ...po, quantity: e.target.value })} /><Input dir="ltr" placeholder="قیمت واحد" value={po.unitCost} onChange={(e) => setPo({ ...po, unitCost: e.target.value })} /><Button disabled={!po.itemId} onClick={() => action.mutate(() => inventoryService.createPurchaseOrder({ branchId, supplierId: po.supplierId || null, items: [{ itemId: po.itemId, quantity: number(po.quantity), unitCost: number(po.unitCost) }] }))}>ثبت سفارش خرید</Button></div> : null}
        {poRows.length ? poRows.map((row) => <div key={row.id} className="rounded-xl border border-line p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-ink">{row.number}</p><p className="text-xs text-ink-muted">{row.supplier?.name ?? 'بدون تأمین‌کننده'} • {row.status}</p></div>{editable && !['RECEIVED','CANCELLED'].includes(row.status) ? <Button size="sm" variant="secondary" onClick={() => action.mutate(() => inventoryService.receivePurchaseOrder(row.id, { items: (row.items ?? []).map((line) => ({ itemId: line.itemId, quantity: Math.max(0, number(line.quantity) - number(line.receivedQuantity)), unitCost: line.unitCost })).filter((line) => line.quantity > 0) }))}>دریافت باقی‌مانده</Button> : null}</div></div>) : <EmptyState title="سفارش خریدی ثبت نشده" />}
      </CardBody></Card>

      <Card><CardHeader title="Recipe / BOM محصولات" description="مصرف مواد اولیه هر واحد محصول. می‌توانید چند ماده را به یک محصول متصل کنید." /><CardBody className="space-y-3">
        <Select value={recipeProductId} onChange={(e) => setRecipeProductId(e.target.value)}><option value="">محصول را انتخاب کنید</option>{productRows.map((p) => <option key={p.id} value={p.id}>{p.nameFa}</option>)}</Select>
        {editable && recipeProductId ? <>{recipeRows.map((row, index) => <div key={index} className="grid grid-cols-[1fr_140px_auto] gap-2"><Select value={row.itemId} onChange={(e) => setRecipeRows((rows) => rows.map((x, i) => i === index ? { ...x, itemId: e.target.value } : x))}><option value="">ماده اولیه</option>{(items.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</Select><Input dir="ltr" value={row.quantity} onChange={(e) => setRecipeRows((rows) => rows.map((x, i) => i === index ? { ...x, quantity: e.target.value } : x))} /><Button variant="ghost" onClick={() => setRecipeRows((rows) => rows.filter((_, i) => i !== index))}>حذف</Button></div>)}<div className="flex gap-2"><Button variant="secondary" onClick={() => setRecipeRows((r) => [...r, { itemId: '', quantity: '1' }])}>ماده دیگر</Button><Button onClick={() => action.mutate(() => inventoryService.setRecipe(recipeProductId, recipeRows.filter((r) => r.itemId).map((r) => ({ itemId: r.itemId, quantity: number(r.quantity) }))))}>ذخیره Recipe</Button></div></> : null}
      </CardBody></Card>

      <Card><CardHeader title="آخرین گردش‌ها" /><CardBody>{movementRows.length ? <div className="space-y-2">{movementRows.slice(0, 30).map((m) => <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"><span>{m.item?.name ?? 'قلم'} • {m.type}</span><span dir="ltr" className={number(m.quantity) < 0 ? 'text-critical' : 'text-positive'}>{number(m.quantity) > 0 ? '+' : ''}{number(m.quantity)}</span></div>)}</div> : <EmptyState title="گردشی وجود ندارد" />}</CardBody></Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value, critical = false }: { icon: typeof Boxes; label: string; value: string; critical?: boolean }) {
  return <Card><CardBody className="flex items-center gap-3"><span className={`flex size-10 items-center justify-center rounded-xl ${critical ? 'bg-critical/10 text-critical' : 'bg-gold/10 text-gold'}`}><Icon className="size-5" /></span><div><p className="text-xs text-ink-muted">{label}</p><p className="font-bold text-ink">{value}</p></div></CardBody></Card>;
}
