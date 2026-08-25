'use client';

import { USER_ROLE_LABELS_FA, UserRole, type StaffDto } from '@restaurant-os/types';
import { createStaffSchema } from '@restaurant-os/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, UserCog, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  RoleBadge,
  Select,
  SkeletonList,
  Switch,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';
import { formatIranianMobile, formatRelativeFa } from '@/lib/format';
import { restaurantService, staffService } from '@/services';

export default function StaffPage() {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffDto | null>(null);
  const [disabling, setDisabling] = useState<StaffDto | null>(null);
  const [resetting, setResetting] = useState<StaffDto | null>(null);

  const staffQuery = useQuery({ queryKey: ['staff'], queryFn: () => staffService.list() });
  const branchesQuery = useQuery({
    queryKey: ['restaurant'],
    queryFn: () => restaurantService.get(),
    staleTime: 5 * 60_000,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['staff'] });

  const disable = useMutation({
    mutationFn: (id: string) => staffService.remove(id),
    onSuccess: () => {
      toast.success('حساب کاربری غیرفعال شد');
      setDisabling(null);
      invalidate();
    },
    onError: (error) =>
      toast.error(
        'غیرفعال‌سازی انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      staffService.update(id, { isActive }),
    onSuccess: () => {
      toast.success('وضعیت حساب به‌روزرسانی شد');
      invalidate();
    },
    onError: (error) =>
      toast.error(
        'تغییر وضعیت انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  const staff = staffQuery.data ?? [];
  const manageable = can('staff:manage');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="کارکنان"
          description="نقش هر کاربر تعیین می‌کند به کدام بخش‌ها دسترسی دارد."
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
                کاربر جدید
              </Button>
            ) : null
          }
        />
        <CardBody className="p-0">
          {staffQuery.isPending ? (
            <div className="p-5">
              <SkeletonList rows={5} />
            </div>
          ) : staffQuery.isError ? (
            <ErrorState onRetry={() => staffQuery.refetch()} />
          ) : staff.length === 0 ? (
            <EmptyState
              icon={<UserCog className="size-6" />}
              title="کاربری ثبت نشده"
              description="برای دسترسی تیم به سیستم، حساب کاربری بسازید."
            />
          ) : (
            <ul className="divide-y divide-line">
              {staff.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold/12 font-semibold text-gold">
                    {member.fullName.charAt(0)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{member.fullName}</span>
                      <RoleBadge role={member.role} />
                      {!member.isActive ? (
                        <Badge tone="critical">غیرفعال</Badge>
                      ) : null}
                      {member.id === user?.id ? (
                        <Badge tone="gold">شما</Badge>
                      ) : null}
                    </div>
                    <p className="ltr-nums mt-0.5 truncate text-xs text-ink-subtle">
                      {member.email}
                      {member.phone ? ` • ${formatIranianMobile(member.phone)}` : ''}
                    </p>
                  </div>

                  <div className="text-end text-xs text-ink-subtle">
                    {member.lastLoginAt ? (
                      <>آخرین ورود {formatRelativeFa(member.lastLoginAt)}</>
                    ) : (
                      'هنوز وارد نشده'
                    )}
                  </div>

                  {manageable && member.id !== user?.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="بازنشانی رمز عبور"
                        onClick={() => setResetting(member)}
                      >
                        <KeyRound className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="ویرایش"
                        onClick={() => {
                          setEditing(member);
                          setFormOpen(true);
                        }}
                      >
                        <UserCog className="size-4" />
                      </Button>
                      {member.isActive ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="غیرفعال کردن"
                          onClick={() => setDisabling(member)}
                        >
                          <UserX className="size-4 text-critical" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            toggleActive.mutate({ id: member.id, isActive: true })
                          }
                        >
                          فعال‌سازی
                        </Button>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <StaffFormModal
        open={formOpen}
        member={editing}
        branches={branchesQuery.data?.branches ?? []}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          invalidate();
        }}
      />

      <ResetPasswordModal
        member={resetting}
        onClose={() => setResetting(null)}
        onDone={() => setResetting(null)}
      />

      <ConfirmDialog
        open={disabling !== null}
        onClose={() => setDisabling(null)}
        onConfirm={() => disabling && disable.mutate(disabling.id)}
        title="غیرفعال کردن حساب"
        message={`«${disabling?.fullName}» دیگر نمی‌تواند وارد سیستم شود و همه نشست‌های فعالش بسته می‌شود. سوابق سفارش‌ها حفظ می‌شود.`}
        confirmLabel="غیرفعال کن"
        loading={disable.isPending}
      />
    </div>
  );
}

function StaffFormModal({
  open,
  member,
  branches,
  onClose,
  onSaved,
}: {
  open: boolean;
  member: StaffDto | null;
  branches: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.CASHIER);
  const [branchId, setBranchId] = useState('');
  const [pinToBranch, setPinToBranch] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setPassword('');
    if (member) {
      setFullName(member.fullName);
      setEmail(member.email);
      setPhone(member.phone ?? '');
      setRole(member.role);
      setBranchId(member.branchId ?? branches[0]?.id ?? '');
      setPinToBranch(member.branchId !== null);
    } else {
      setFullName('');
      setEmail('');
      setPhone('');
      setRole(UserRole.CASHIER);
      setBranchId(branches[0]?.id ?? '');
      setPinToBranch(true);
    }
  }, [open, member, branches]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        role,
        branchId: pinToBranch ? branchId || null : null,
        ...(member ? {} : { password }),
      };

      if (!member) {
        const parsed = createStaffSchema.safeParse(payload);
        if (!parsed.success) {
          const fieldErrors: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            fieldErrors[String(issue.path[0])] = issue.message;
          }
          setErrors(fieldErrors);
          throw new Error('validation');
        }
      }
      setErrors({});

      return member
        ? staffService.update(member.id, payload)
        : staffService.create(payload);
    },
    onSuccess: () => {
      toast.success(member ? 'کاربر به‌روزرسانی شد' : 'کاربر ساخته شد');
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
      title={member ? 'ویرایش کاربر' : 'کاربر جدید'}
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
            ذخیره
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Input
          label="نام و نام خانوادگی"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
          required
        />
        <Input
          label="ایمیل"
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
        />
        <Input
          label="شماره موبایل"
          dir="ltr"
          inputMode="numeric"
          placeholder="۰۹۱۲۱۲۳۴۵۶۷"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
        />

        {!member ? (
          <Input
            label="رمز عبور اولیه"
            type="text"
            dir="ltr"
            hint="حداقل ۱۰ کاراکتر شامل حرف و عدد. کاربر در اولین ورود آن را تغییر می‌دهد."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            required
          />
        ) : null}

        <Select
          label="نقش"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          options={(Object.keys(USER_ROLE_LABELS_FA) as UserRole[]).map((value) => ({
            value,
            label: USER_ROLE_LABELS_FA[value],
          }))}
          error={errors.role}
        />

        <Switch
          checked={pinToBranch}
          onChange={setPinToBranch}
          label="محدود به یک شعبه"
          description="کاربر محدودشده فقط به داده‌های شعبه خودش دسترسی دارد."
        />

        {pinToBranch && branches.length > 0 ? (
          <Select
            label="شعبه"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />
        ) : null}
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  member,
  onClose,
  onDone,
}: {
  member: StaffDto | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [password, setPassword] = useState('');

  const reset = useMutation({
    mutationFn: () => staffService.resetPassword(member!.id, password),
    onSuccess: () => {
      toast.success('رمز عبور بازنشانی شد', 'همه نشست‌های این کاربر بسته شد.');
      setPassword('');
      onDone();
    },
    onError: (error) =>
      toast.error(
        'بازنشانی انجام نشد',
        error instanceof ApiError ? error.message : undefined,
      ),
  });

  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title="بازنشانی رمز عبور"
      description={member?.fullName}
      size="sm"
      footer={
        <Button
          variant="primary"
          fullWidth
          loading={reset.isPending}
          onClick={() => reset.mutate()}
        >
          بازنشانی
        </Button>
      }
    >
      <Input
        label="رمز عبور جدید"
        dir="ltr"
        hint="حداقل ۱۰ کاراکتر شامل حرف و عدد"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </Modal>
  );
}
