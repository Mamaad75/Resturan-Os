'use client';

import type { TimeSeriesPoint } from '@restaurant-os/types';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/ui';
import { formatMoney, formatMoneyCompact, toPersianDigits } from '@/lib/format';

const AXIS_STYLE = { fill: 'rgb(113 113 122)', fontSize: 11 };
const GOLD = 'rgb(201 162 75)';

/** Categorical palette; gold leads, the rest stay muted so it keeps its meaning. */
export const CHART_COLORS = [
  GOLD,
  'rgb(96 165 250)',
  'rgb(52 211 153)',
  'rgb(167 139 250)',
  'rgb(251 191 36)',
];

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lifted">
      <p className="mb-1 text-xs text-ink-muted">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm font-semibold text-ink">
          {formatMoney(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function SalesAreaChart({
  data,
  height = 260,
}: {
  data: TimeSeriesPoint[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="داده‌ای برای نمایش نیست"
        description="در این بازه زمانی هنوز فروشی ثبت نشده است."
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {/* `reversed` so the timeline reads right-to-left, like the rest of the UI. */}
        <XAxis
          dataKey="label"
          reversed
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          orientation="right"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          width={64}
          tickFormatter={(value: number) => formatMoneyCompact(value).replace(' تومان', '')}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgb(56 56 64)' }} />
        <Area
          type="monotone"
          dataKey="total"
          stroke={GOLD}
          strokeWidth={2}
          fill="url(#salesFill)"
          name="فروش"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HourlyBarChart({ data }: { data: TimeSeriesPoint[] }) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="داده‌ای برای نمایش نیست"
        description="هنوز سفارشی در این بازه ثبت نشده است."
      />
    );
  }

  const peak = Math.max(...data.map((point) => point.total));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <XAxis
          dataKey="label"
          reversed
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          orientation="right"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          width={64}
          tickFormatter={(value: number) => formatMoneyCompact(value).replace(' تومان', '')}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(38 38 44 / 0.5)' }} />
        <Bar dataKey="total" name="فروش" radius={[6, 6, 0, 0]}>
          {data.map((point) => (
            // The busiest hour is highlighted; the rest recede.
            <Cell
              key={point.bucket}
              fill={point.total === peak ? GOLD : 'rgb(201 162 75 / 0.28)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BreakdownDonut({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return (
      <EmptyState title="داده‌ای برای نمایش نیست" description="هنوز پرداختی ثبت نشده است." />
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ResponsiveContainer width="100%" height={180} className="max-w-48">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <ul className="flex-1 space-y-2.5">
        {data.map((entry, index) => (
          <li key={entry.label} className="flex items-center gap-2.5 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="flex-1 text-ink-muted">{entry.label}</span>
            <span className="font-medium text-ink">
              {toPersianDigits(Math.round((entry.value / total) * 100))}٪
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
