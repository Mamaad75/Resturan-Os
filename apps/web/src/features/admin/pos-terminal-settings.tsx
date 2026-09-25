'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, PlugZap } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, CardBody, CardHeader, Input, Switch, useToast } from '@/components/ui';
import { restaurantService, terminalService } from '@/services';

export function PosTerminalSettings({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const restaurant = useQuery({ queryKey: ['restaurant'], queryFn: () => restaurantService.get() });
  const branchId = restaurant.data?.branches[0]?.id;
  const terminals = useQuery({ queryKey: ['pos-terminals-settings', branchId], queryFn: () => terminalService.list(branchId), enabled: !!branchId });
  const [form, setForm] = useState({ name: '', terminalKey: '', bridgeUrl: 'http://127.0.0.1:17840', isDefault: true });
  const create = useMutation({
    mutationFn: () => terminalService.create({ branchId, name: form.name, provider: 'LOCAL_BRIDGE', terminalKey: form.terminalKey || null, bridgeUrl: form.bridgeUrl, isDefault: form.isDefault, isActive: true }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['pos-terminals-settings'] }); await qc.invalidateQueries({ queryKey: ['pos-terminals'] }); setForm({ name: '', terminalKey: '', bridgeUrl: 'http://127.0.0.1:17840', isDefault: false }); toast.success('کارتخوان اضافه شد'); },
    onError: (e) => toast.error('ثبت کارتخوان انجام نشد', e instanceof Error ? e.message : undefined),
  });

  return <Card>
    <CardHeader title="کارتخوان‌های POS" description="FoodOS با یک Terminal Bridge محلی به SDK/USB/LAN دستگاه کارتخوان وصل می‌شود؛ اطلاعات کارت وارد وب‌اپ نمی‌شود." />
    <CardBody className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">{(terminals.data ?? []).map((terminal) => <div key={terminal.id} className="flex items-start gap-3 rounded-xl border border-line p-4"><span className="flex size-10 items-center justify-center rounded-xl bg-gold/10 text-gold"><CreditCard className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="font-medium text-ink">{terminal.name}</p>{terminal.isDefault ? <span className="text-xs text-gold">پیش‌فرض</span> : null}</div><p className="mt-1 truncate text-xs text-ink-muted" dir="ltr">{terminal.bridgeUrl ?? 'Bridge تنظیم نشده'}</p><p className="mt-1 text-xs text-ink-subtle">{terminal.provider} • {terminal.isActive ? 'فعال' : 'غیرفعال'}</p></div></div>)}</div>
      {editable ? <div className="grid gap-2 md:grid-cols-4"><Input placeholder="نام دستگاه" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><Input placeholder="Terminal ID / Key" dir="ltr" value={form.terminalKey} onChange={(e) => setForm({ ...form, terminalKey: e.target.value })} /><Input placeholder="Bridge URL" dir="ltr" value={form.bridgeUrl} onChange={(e) => setForm({ ...form, bridgeUrl: e.target.value })} /><div className="flex items-center gap-2"><Switch checked={form.isDefault} onChange={(v) => setForm({ ...form, isDefault: v })} label="پیش‌فرض" /><Button disabled={!form.name || !form.bridgeUrl} loading={create.isPending} onClick={() => create.mutate()}><PlugZap className="size-4" />اتصال</Button></div></div> : null}
      <p className="text-xs leading-6 text-ink-muted">قرارداد Bridge: <span dir="ltr" className="font-mono">POST /v1/pay</span> با مبلغ و شناسه سفارش؛ پاسخ موفق باید <span dir="ltr" className="font-mono">success, trace/rrn</span> برگرداند. برای مدل کارتخوان واقعی فقط Adapter همان PSP/SDK به Bridge اضافه می‌شود.</p>
    </CardBody>
  </Card>;
}
