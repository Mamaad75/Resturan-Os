import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NotificationType, RealtimeEvent, WAITER_CALL_REASON_LABELS_FA, toPersianDigits } from '@restaurant-os/types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Durable waiter-call escalation. No in-memory setTimeouts: restarts do not lose
 * pending calls. Each sweep advances only calls old enough for their next level.
 */
@Injectable()
export class WaiterEscalationService {
  private readonly logger = new Logger(WaiterEscalationService.name);
  private running = false;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  @Interval(15_000)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await runAsSystem('waiter call escalation sweep', async () => {
        const now = Date.now();
        const calls = await this.prisma.waiterCall.findMany({
          where: { status: 'OPEN', escalationLevel: { lt: 3 } },
          include: { table: { select: { number: true } } },
          orderBy: { createdAt: 'asc' },
          take: 100,
        });

        for (const call of calls) {
          const ageSeconds = Math.floor((now - call.createdAt.getTime()) / 1000);
          const targetLevel = ageSeconds >= 90 ? 3 : ageSeconds >= 45 ? 2 : ageSeconds >= 15 ? 1 : 0;
          if (targetLevel <= call.escalationLevel) continue;
          await this.escalate(call, targetLevel);
        }
      });
    } catch (error) {
      this.logger.error('Waiter escalation sweep failed', error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }

  private async escalate(
    call: { id: string; tenantId: string; branchId: string; tableId: string; assignedToId: string | null; reason: string; note: string | null; createdAt: Date; escalationLevel: number; table: { number: number } },
    level: number,
  ) {
    let roles: Array<'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER'>;
    if (level === 1) roles = ['WAITER'];
    else if (level === 2) roles = ['MANAGER', 'CASHIER'];
    else roles = ['OWNER'];

    let recipients = await this.notifications.staffRecipients(call.tenantId, call.branchId, roles);
    if (level === 1 && call.assignedToId) recipients = recipients.filter((id) => id !== call.assignedToId);

    // Claim this escalation level first so parallel app instances cannot fan out
    // the same alarm twice.
    const claimed = await this.prisma.waiterCall.updateMany({
      where: { id: call.id, tenantId: call.tenantId, status: 'OPEN', escalationLevel: { lt: level } },
      data: { escalationLevel: level, escalatedAt: new Date() },
    });
    if (claimed.count === 0) return;
    if (!recipients.length) return;

    const reason = WAITER_CALL_REASON_LABELS_FA[call.reason as keyof typeof WAITER_CALL_REASON_LABELS_FA] ?? 'درخواست خدمات';
    const title = `میز ${toPersianDigits(call.table.number)} هنوز منتظر است`;
    await this.notifications.createMany(recipients.map((userId) => ({
      tenantId: call.tenantId,
      branchId: call.branchId,
      userId,
      type: NotificationType.WAITER_CALLED,
      title,
      body: call.note ?? `${reason} — سطح پیگیری ${toPersianDigits(level)}`,
      entityId: call.id,
    })));

    this.events.emit(RealtimeEvent.WAITER_CALLED, {
      tenantId: call.tenantId,
      branchId: call.branchId,
      callId: call.id,
      tableId: call.tableId,
      tableNumber: call.table.number,
      reason: call.reason,
      note: call.note,
      createdAt: call.createdAt.toISOString(),
      recipientUserIds: recipients,
      escalationLevel: level,
    });
  }
}
