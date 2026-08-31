import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PlatformAuditEntry } from '@restaurant-os/types';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';

export interface PlatformAuditInput {
  adminId: string;
  tenantId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Actions worth recording. Anything that changes a tenant's standing. */
export const PlatformAction = {
  TENANT_SUSPEND: 'tenant.suspend',
  TENANT_ACTIVATE: 'tenant.activate',
  TENANT_DISABLE: 'tenant.disable',
  TENANT_RESTORE: 'tenant.restore',
  TENANT_NOTES: 'tenant.notes',
  SUBSCRIPTION_UPDATE: 'subscription.update',
  SUBSCRIPTION_EXTEND: 'subscription.extend',
  PLAN_CHANGE: 'subscription.plan_change',
  PLAN_CREATE: 'plan.create',
  PLAN_UPDATE: 'plan.update',
} as const;

/**
 * Append-only record of what the platform did to whom.
 *
 * Separate from the tenant audit log: a tenant must not be able to read that
 * the platform suspended them and why, and the actor here is a PlatformAdmin
 * rather than a User, so it cannot share that table's foreign key.
 *
 * Writes never throw. Losing an audit line is bad; failing the suspension that
 * was being audited is worse.
 */
@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  record(input: PlatformAuditInput): void {
    void runAsSystem('platform audit write', () =>
      this.prisma.platformAuditLog.create({
        data: {
          adminId: input.adminId,
          tenantId: input.tenantId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          previousValue: toJson(input.previousValue),
          newValue: toJson(input.newValue),
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent?.slice(0, 300) ?? null,
        },
      }),
    ).catch((error) => {
      this.logger.error(
        `Failed to write platform audit entry ${input.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  async list(options: { tenantId?: string; limit?: number } = {}) {
    const rows = await runAsSystem('platform audit read', () =>
      this.prisma.platformAuditLog.findMany({
        where: options.tenantId ? { tenantId: options.tenantId } : {},
        orderBy: { createdAt: 'desc' },
        take: Math.min(options.limit ?? 20, 100),
        include: {
          admin: { select: { fullName: true } },
          tenant: { select: { name: true } },
        },
      }),
    );
    return rows.map(toEntry);
  }
}

function toJson(value: unknown) {
  if (value === undefined || value === null) return undefined;
  // Dates do not survive Prisma's Json column as Dates; freeze them to ISO now
  // so the audit trail reads the same as what the operator saw.
  return JSON.parse(JSON.stringify(value)) as object;
}

export function toEntry(row: {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  previousValue: unknown;
  newValue: unknown;
  createdAt: Date;
  admin: { fullName: string } | null;
  tenant: { name: string } | null;
}): PlatformAuditEntry {
  return {
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    adminName: row.admin?.fullName ?? null,
    tenantName: row.tenant?.name ?? null,
    previousValue: row.previousValue ?? null,
    newValue: row.newValue ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
