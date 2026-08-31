import { Inject, Injectable } from '@nestjs/common';
import { AuditAction, UserRole, type StaffDto } from '@restaurant-os/types';
import type {
  CreateStaffInput,
  UpdateStaffInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';

@Injectable()
export class StaffService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
  ) {}

  async list(ctx: RequestContext): Promise<StaffDto[]> {
    const rows = await this.prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      include: { branch: { select: { name: true } } },
    });
    return rows.map(toStaffDto);
  }

  async create(ctx: RequestContext, input: CreateStaffInput): Promise<StaffDto> {
    // The plan's staff ceiling, checked before anything is written. Hiding the
    // button in the admin would not stop a direct API call.
    await this.plans.requireCapacity(ctx.tenantId, 'maxStaff');

    this.assertCanManageRole(ctx, input.role);

    const clash = await this.prisma.user.findFirst({
      where: { tenantId: ctx.tenantId, email: input.email },
      select: { id: true },
    });
    if (clash) {
      throw AppException.conflict('کاربری با این ایمیل در این مجموعه وجود دارد.');
    }

    if (input.branchId) {
      await this.assertBranchInTenant(ctx, input.branchId);
    }

    const created = await this.prisma.user.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: input.branchId ?? null,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone ?? null,
        role: input.role,
        passwordHash: await this.passwords.hash(input.password),
        // The creator chose this password, so the owner of the account should
        // replace it on first sign-in.
        mustChangePassword: true,
      },
      include: { branch: { select: { name: true } } },
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: created.id,
      metadata: { email: created.email, role: created.role },
    });
    return toStaffDto(created);
  }

  async update(
    ctx: RequestContext,
    id: string,
    input: UpdateStaffInput,
  ): Promise<StaffDto> {
    const user = await this.getOwned(ctx, id);
    if (input.role) this.assertCanManageRole(ctx, input.role);
    if (input.branchId) await this.assertBranchInTenant(ctx, input.branchId);

    // An owner locking or demoting themselves would leave the tenant stranded.
    if (user.id === ctx.userId) {
      if (input.isActive === false) {
        throw AppException.conflict('نمی‌توانید حساب خود را غیرفعال کنید.');
      }
      if (input.role && input.role !== user.role) {
        throw AppException.conflict('نمی‌توانید نقش خود را تغییر دهید.');
      }
    }

    if (
      user.role === UserRole.OWNER &&
      (input.role !== undefined || input.isActive === false)
    ) {
      await this.assertNotLastOwner(ctx, user.id);
    }

    const updated = await this.prisma.user.update({
      where: { id, tenantId: ctx.tenantId },
      data: {
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { branch: { select: { name: true } } },
    });

    // A disabled or re-roled account must not keep acting on an old token.
    if (input.isActive === false || input.role !== undefined) {
      await this.auth.revokeAllSessions(id);
    }

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: input.role
        ? AuditAction.PERMISSION_CHANGE
        : AuditAction.UPDATE,
      entity: 'User',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return toStaffDto(updated);
  }

  async resetPassword(
    ctx: RequestContext,
    id: string,
    newPassword: string,
  ): Promise<{ reset: true }> {
    const user = await this.getOwned(ctx, id);

    await this.prisma.user.update({
      where: { id: user.id, tenantId: ctx.tenantId },
      data: {
        passwordHash: await this.passwords.hash(newPassword),
        mustChangePassword: true,
      },
    });
    await this.auth.revokeAllSessions(user.id);

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: id,
      metadata: { field: 'password', reset: true },
    });
    return { reset: true };
  }

  async remove(ctx: RequestContext, id: string) {
    const user = await this.getOwned(ctx, id);
    if (user.id === ctx.userId) {
      throw AppException.conflict('نمی‌توانید حساب خود را حذف کنید.');
    }
    if (user.role === UserRole.OWNER) {
      await this.assertNotLastOwner(ctx, user.id);
    }

    // Soft-disable rather than delete: orders and audit rows reference this
    // user, and the history is worth more than the row.
    await this.prisma.user.update({
      where: { id, tenantId: ctx.tenantId },
      data: { isActive: false },
    });
    await this.auth.revokeAllSessions(id);

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.DELETE,
      entity: 'User',
      entityId: id,
      metadata: { email: user.email, softDeleted: true },
    });
    return { disabled: true };
  }

  /** Only an owner may create or promote another owner. */
  private assertCanManageRole(ctx: RequestContext, role: UserRole): void {
    if (role === UserRole.OWNER && ctx.role !== UserRole.OWNER) {
      throw AppException.forbidden('فقط مالک می‌تواند نقش مالک را اعطا کند.');
    }
  }

  private async assertNotLastOwner(ctx: RequestContext, userId: string): Promise<void> {
    const otherOwners = await this.prisma.user.count({
      where: {
        tenantId: ctx.tenantId,
        role: UserRole.OWNER,
        isActive: true,
        id: { not: userId },
      },
    });
    if (otherOwners === 0) {
      throw AppException.conflict(
        'حداقل یک مالک فعال باید در مجموعه باقی بماند.',
      );
    }
  }

  private async assertBranchInTenant(ctx: RequestContext, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!branch) throw AppException.notFound('شعبه');
  }

  private async getOwned(ctx: RequestContext, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!user) throw AppException.notFound('کاربر');
    return user;
  }
}

function toStaffDto(row: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  branchId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  branch?: { name: string } | null;
}): StaffDto {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    role: row.role,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
