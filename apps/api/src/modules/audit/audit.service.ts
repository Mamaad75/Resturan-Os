import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuditAction } from '@restaurant-os/types';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { buildPaginationMeta, paginationArgs } from '../../common/utils/pagination.util';
import type { RequestContext } from '../../common/types/request-context';

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  action: AuditAction | string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only record of privileged actions.
 *
 * Writes are deliberately fire-and-forget: an audit failure must never fail the
 * business operation that triggered it, but it is always logged loudly.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  record(entry: AuditEntry): void {
    void this.recordAsync(entry);
  }

  async recordAsync(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          metadata: (entry.metadata ?? undefined) as never,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent?.slice(0, 300) ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${entry.entity}#${entry.entityId ?? '-'}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async list(
    ctx: RequestContext,
    query: { page: number; pageSize: number; entity?: string; userId?: string },
  ) {
    const where = {
      tenantId: ctx.tenantId,
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { fullName: true } } },
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        userId: row.userId,
        userName: row.user?.fullName ?? null,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }
}
