import { Inject, Injectable } from '@nestjs/common';
import type { PlanDto } from '@restaurant-os/types';
import type { CreatePlanInput, UpdatePlanInput } from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { PlatformContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { toPlanDto } from '../plans/plans.service';
import { PlatformAction, PlatformAuditService } from './platform-audit.service';
import type { AuditMeta } from './platform-tenants.service';

/**
 * Plan authoring.
 *
 * Plans are dynamic rows, not constants in code: the platform can add a tier
 * or move a limit without a deployment, and every enforcement point reads the
 * current row.
 */
@Injectable()
export class PlatformPlansService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async create(
    admin: PlatformContext,
    input: CreatePlanInput,
    meta: AuditMeta,
  ): Promise<PlanDto> {
    const existing = await runAsSystem('platform: plan key check', () =>
      this.prisma.plan.findUnique({ where: { key: input.key } }),
    );
    if (existing) {
      throw AppException.conflict('پلنی با این کلید از قبل وجود دارد.');
    }

    const created = await runAsSystem('platform: create plan', async () => {
      // Only one plan can be the signup default.
      if (input.isDefault) await this.clearDefaultFlag();
      return this.prisma.plan.create({ data: input });
    });

    this.audit.record({
      adminId: admin.adminId,
      action: PlatformAction.PLAN_CREATE,
      entity: 'Plan',
      entityId: created.id,
      newValue: { key: created.key, name: created.name },
      ...meta,
    });
    return toPlanDto(created);
  }

  async update(
    admin: PlatformContext,
    planId: string,
    input: UpdatePlanInput,
    meta: AuditMeta,
  ): Promise<PlanDto> {
    const before = await runAsSystem('platform: read plan', () =>
      this.prisma.plan.findUnique({ where: { id: planId } }),
    );
    if (!before) throw AppException.notFound('پلن');

    // Undefined means "leave alone"; null on a limit means "unlimited". The
    // Zod schema already separates the two, so the payload is passed straight
    // through rather than being rebuilt key by key.
    const data = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );

    const updated = await runAsSystem('platform: update plan', async () => {
      if (input.isDefault) await this.clearDefaultFlag(planId);
      return this.prisma.plan.update({ where: { id: planId }, data });
    });

    this.audit.record({
      adminId: admin.adminId,
      action: PlatformAction.PLAN_UPDATE,
      entity: 'Plan',
      entityId: planId,
      previousValue: before,
      newValue: updated,
      ...meta,
    });
    return toPlanDto(updated);
  }

  private clearDefaultFlag(exceptId?: string) {
    return this.prisma.plan.updateMany({
      where: { isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }
}
