import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderStatus } from '@restaurant-os/types';
import { DomainEvent, type OrderCreatedEvent, type OrderStatusChangedEvent } from '../../events/domain-events';
import { runAsSystem } from '../../prisma/tenant-scope';
import { InventoryService } from './inventory.service';

@Injectable()
export class InventoryListener {
  private readonly logger = new Logger(InventoryListener.name);
  constructor(private readonly inventory: InventoryService) {}

  @OnEvent(DomainEvent.ORDER_CREATED, { async: true })
  async onCreated(event: OrderCreatedEvent) {
    if (event.status !== OrderStatus.SENT_TO_KITCHEN && event.status !== OrderStatus.PREPARING) return;
    await this.safe('consume created order', event.orderId, () => runAsSystem('inventory consume order', () => this.inventory.consumeOrder(event.tenantId, event.branchId, event.orderId)));
  }

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: true })
  async onStatus(event: OrderStatusChangedEvent) {
    if (event.toStatus === OrderStatus.SENT_TO_KITCHEN || event.toStatus === OrderStatus.PREPARING) {
      await this.safe('consume order', event.orderId, () => runAsSystem('inventory consume order', () => this.inventory.consumeOrder(event.tenantId, event.branchId, event.orderId)));
    }
    if (event.toStatus === OrderStatus.CANCELLED) {
      await this.safe('rollback order', event.orderId, () => runAsSystem('inventory rollback order', () => this.inventory.rollbackOrder(event.tenantId, event.branchId, event.orderId)));
    }
  }

  private async safe(label: string, orderId: string, fn: () => Promise<unknown>) {
    try { await fn(); }
    catch (error) { this.logger.error(`${label} failed for ${orderId}`, error instanceof Error ? error.stack : String(error)); }
  }
}
