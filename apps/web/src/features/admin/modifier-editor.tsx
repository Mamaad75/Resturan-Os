'use client';

import { ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Input, Select, Switch } from '@/components/ui';
import { toPersianDigits } from '@/lib/format';
import type { PublicModifierGroup } from '@restaurant-os/types';

/**
 * Draft shape used while editing. Everything is a string so a half-typed
 * number never becomes `NaN` mid-keystroke; conversion happens once on submit.
 */
export interface DraftOption {
  key: string;
  name: string;
  nameFa: string;
  priceDelta: string;
  isAvailable: boolean;
}

export interface DraftGroup {
  key: string;
  name: string;
  nameFa: string;
  type: 'SINGLE' | 'MULTIPLE';
  isRequired: boolean;
  minSelect: string;
  maxSelect: string;
  options: DraftOption[];
}

let counter = 0;
/** Stable list keys; never sent to the server. */
function nextKey(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function emptyOption(): DraftOption {
  return { key: nextKey('opt'), name: '', nameFa: '', priceDelta: '0', isAvailable: true };
}

export function emptyGroup(): DraftGroup {
  return {
    key: nextKey('grp'),
    name: '',
    nameFa: '',
    type: 'SINGLE',
    isRequired: false,
    minSelect: '0',
    maxSelect: '1',
    options: [emptyOption()],
  };
}

/** Server shape -> draft shape when an existing product is opened. */
export function toDraftGroups(groups: PublicModifierGroup[]): DraftGroup[] {
  return groups.map((group) => ({
    key: nextKey('grp'),
    name: group.name,
    nameFa: group.nameFa,
    type: group.type === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE',
    isRequired: group.isRequired,
    minSelect: String(group.minSelect),
    maxSelect: String(group.maxSelect),
    options: group.options.map((option) => ({
      key: nextKey('opt'),
      name: option.name,
      nameFa: option.nameFa,
      priceDelta: String(option.priceDelta),
      isAvailable: option.isAvailable,
    })),
  }));
}

function toInt(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

/**
 * Draft shape -> API payload. The `id` fields are deliberately dropped: the
 * API replaces modifier groups wholesale on update, so sending stale ids would
 * only invite a mismatch.
 */
export function toModifierPayload(groups: DraftGroup[]) {
  return groups.map((group, groupIndex) => ({
    name: group.name.trim() || group.nameFa.trim(),
    nameFa: group.nameFa.trim(),
    type: group.type,
    isRequired: group.isRequired,
    minSelect: toInt(group.minSelect),
    maxSelect: toInt(group.maxSelect),
    displayOrder: groupIndex,
    options: group.options.map((option, optionIndex) => ({
      name: option.name.trim() || option.nameFa.trim(),
      nameFa: option.nameFa.trim(),
      priceDelta: toInt(option.priceDelta),
      isAvailable: option.isAvailable,
      displayOrder: optionIndex,
    })),
  }));
}

/**
 * Modifier group editor.
 *
 * The rules enforced here mirror `modifierGroupSchema` exactly, so a group that
 * looks valid in the form is accepted by the API. Anything the schema rejects
 * is surfaced inline before the request is sent.
 */
export function ModifierEditor({
  groups,
  onChange,
  errors,
}: {
  groups: DraftGroup[];
  onChange: (groups: DraftGroup[]) => void;
  errors?: Record<string, string>;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function patchGroup(key: string, patch: Partial<DraftGroup>) {
    onChange(
      groups.map((group) => {
        if (group.key !== key) return group;
        const next = { ...group, ...patch };
        // A single-choice group can only ever take one selection; keeping
        // maxSelect in sync avoids an error the user did not cause.
        if (patch.type === 'SINGLE') next.maxSelect = '1';
        if (patch.isRequired === true && toInt(next.minSelect) < 1) next.minSelect = '1';
        if (patch.isRequired === false && next.minSelect === '1') next.minSelect = '0';
        return next;
      }),
    );
  }

  function patchOption(groupKey: string, optionKey: string, patch: Partial<DraftOption>) {
    onChange(
      groups.map((group) =>
        group.key === groupKey
          ? {
              ...group,
              options: group.options.map((option) =>
                option.key === optionKey ? { ...option, ...patch } : option,
              ),
            }
          : group,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-ink">گروه‌های گزینه</span>
          <p className="text-xs text-ink-subtle">
            مثل «سایز»، «نوع شیر» یا «افزودنی» — روی قیمت نهایی اثر می‌گذارد.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Plus className="size-4" />}
          onClick={() => onChange([...groups, emptyGroup()])}
        >
          گروه جدید
        </Button>
      </div>

      {errors?.modifierGroups ? (
        <p className="text-xs text-critical">{errors.modifierGroups}</p>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-ink-subtle">
          این محصول گزینه‌ای ندارد. اگر مشتری باید بین سایز یا افزودنی انتخاب کند، یک
          گروه اضافه کنید.
        </p>
      ) : null}

      {groups.map((group, groupIndex) => {
        const isCollapsed = collapsed[group.key] ?? false;
        return (
          <div
            key={group.key}
            className="rounded-xl border border-line bg-surface-sunken p-3"
          >
            <div className="flex items-center gap-2">
              <GripVertical className="size-4 shrink-0 text-ink-subtle" />
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [group.key]: !isCollapsed }))
                }
                className="flex min-w-0 flex-1 items-center gap-2 text-start"
              >
                <ChevronDown
                  className={`size-4 shrink-0 text-ink-subtle transition-transform ${
                    isCollapsed ? '-rotate-90' : ''
                  }`}
                />
                <span className="truncate text-sm font-medium text-ink">
                  {group.nameFa.trim() || `گروه ${toPersianDigits(groupIndex + 1)}`}
                </span>
                <span className="shrink-0 text-xs text-ink-subtle">
                  {toPersianDigits(group.options.length)} گزینه
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="حذف گروه"
                onClick={() =>
                  onChange(groups.filter((item) => item.key !== group.key))
                }
              >
                <Trash2 className="size-4 text-critical" />
              </Button>
            </div>

            {isCollapsed ? null : (
              <div className="mt-3 space-y-3 border-t border-line pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="نام فارسی گروه"
                    value={group.nameFa}
                    onChange={(e) => patchGroup(group.key, { nameFa: e.target.value })}
                    placeholder="سایز"
                  />
                  <Select
                    label="نوع انتخاب"
                    value={group.type}
                    onChange={(e) =>
                      patchGroup(group.key, {
                        type: e.target.value as DraftGroup['type'],
                      })
                    }
                    options={[
                      { value: 'SINGLE', label: 'یک گزینه' },
                      { value: 'MULTIPLE', label: 'چند گزینه' },
                    ]}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Switch
                    checked={group.isRequired}
                    onChange={(value) => patchGroup(group.key, { isRequired: value })}
                    label="انتخاب اجباری"
                  />
                  <Input
                    label="حداقل انتخاب"
                    dir="ltr"
                    inputMode="numeric"
                    value={group.minSelect}
                    onChange={(e) =>
                      patchGroup(group.key, { minSelect: e.target.value })
                    }
                  />
                  <Input
                    label="حداکثر انتخاب"
                    dir="ltr"
                    inputMode="numeric"
                    disabled={group.type === 'SINGLE'}
                    hint={group.type === 'SINGLE' ? 'در حالت تک‌انتخابی همیشه ۱' : undefined}
                    value={group.maxSelect}
                    onChange={(e) =>
                      patchGroup(group.key, { maxSelect: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  {group.options.map((option) => (
                    <div key={option.key} className="flex items-end gap-2">
                      <Input
                        label="گزینه"
                        containerClassName="flex-1"
                        value={option.nameFa}
                        onChange={(e) =>
                          patchOption(group.key, option.key, { nameFa: e.target.value })
                        }
                        placeholder="بزرگ"
                      />
                      <Input
                        label="اختلاف قیمت"
                        containerClassName="w-36"
                        dir="ltr"
                        inputMode="numeric"
                        rightAddon="تومان"
                        value={option.priceDelta}
                        onChange={(e) =>
                          patchOption(group.key, option.key, {
                            priceDelta: e.target.value,
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="حذف گزینه"
                        disabled={group.options.length <= 1}
                        onClick={() =>
                          patchGroup(group.key, {
                            options: group.options.filter(
                              (item) => item.key !== option.key,
                            ),
                          })
                        }
                      >
                        <Trash2 className="size-4 text-critical" />
                      </Button>
                    </div>
                  ))}

                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Plus className="size-4" />}
                    onClick={() =>
                      patchGroup(group.key, {
                        options: [...group.options, emptyOption()],
                      })
                    }
                  >
                    افزودن گزینه
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
