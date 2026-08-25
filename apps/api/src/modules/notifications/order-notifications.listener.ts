import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  formatMoney,
  NOTIFICATION_TITLE_FA,
  NotificationChannel,
  NotificationType,
  ORDER_STATUS_CUSTOMER_MESSAGE_FA,
  ORDER_STATUS_LABELS_FA,
  OrderStatus,
  SMS_WORTHY_STATUSES,
  STATUS_NOTIFICATION_TYPE,
  toPersianDigits,
} from '@restaurant-os/types';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import {
  DomainEvent,
  type OrderCreatedEvent,
  type OrderStatusChangedEvent,
  type PaymentRecordedEvent,
} from '../../events/domain-events';
import { runAsSystem } from '../../prisma/tenant-scope';
import { SmsService } from '../sms/sms.service';
import { NotificationsService } from './notifications.service';

/**
 * Turns domain events into customer and staff notifications.
 *
 * Everything here is deliberately downstream of the order transaction: a
 * failure to notify is logged and swallowed, never propagated back into the
 * order that triggered it.
 */
@Injectable()
export class OrderNotificationsListener {
  private readonly logger = new Logger(OrderNotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private trackingUrl(token: string): string {
    return `${this.config.appUrl.replace(/\/$/, '')}/order/track/${token}`;
  }

  @OnEvent(DomainEvent.ORDER_CREATED, { async: true })
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      await runAsSystem('order created notifications', async () => {
        const where =
          event.tableNumber != null
            ? `میز ${toPersianDigits(event.tableNumber)}`
            : 'بیرون‌بر';

        // Staff who work the floor get an inbox entry for the new ticket.
        const recipients = await this.notifications.staffRecipients(
          event.tenantId,
          event.branchId,
          ['OWNER', 'MANAGER', 'CASHIER', 'WAITER'],
        );
        await this.notifications.createMany(
          recipients.map((userId) => ({
            tenantId: event.tenantId,
            branchId: event.branchId,
            userId,
            orderId: event.orderId,
            type: NotificationType.ORDER_CREATED,
            title: `سفارش جدید #${toPersianDigits(event.orderNumber)}`,
            body: `${where} • ${formatMoney(event.total)}`,
          })),
        );

        // The customer's own copy, readable from the tracking page.
        await this.notifications.create({
          tenantId: event.tenantId,
          branchId: event.branchId,
          customerId: event.customerId,
          orderId: event.orderId,
          type: NotificationType.ORDER_CREATED,
          title: NOTIFICATION_TITLE_FA[NotificationType.ORDER_CREATED],
          body: ORDER_STATUS_CUSTOMER_MESSAGE_FA[OrderStatus.PENDING],
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to raise notifications for order ${event.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: true })
  async onStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    try {
      await runAsSystem('order status notifications', async () => {
        const type = STATUS_NOTIFICATION_TYPE[event.toStatus];

        await this.notifications.create({
          tenantId: event.tenantId,
          branchId: event.branchId,
          customerId: event.customerId,
          orderId: event.orderId,
          type,
          title: NOTIFICATION_TITLE_FA[type],
          body: ORDER_STATUS_CUSTOMER_MESSAGE_FA[event.toStatus],
        });

        // A cancellation is the one transition the whole floor should see.
        if (event.toStatus === OrderStatus.CANCELLED) {
          const recipients = await this.notifications.staffRecipients(
            event.tenantId,
            event.branchId,
            ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER'],
          );
          await this.notifications.createMany(
            recipients.map((userId) => ({
              tenantId: event.tenantId,
              branchId: event.branchId,
              userId,
              orderId: event.orderId,
              type: NotificationType.ORDER_CANCELLED,
              title: `سفارش #${toPersianDigits(event.orderNumber)} لغو شد`,
              body: ORDER_STATUS_LABELS_FA[event.toStatus],
            })),
          );
        }

        await this.maybeSendSms(event);
      });
    } catch (error) {
      this.logger.error(
        `Failed to raise notifications for order ${event.orderId} status change`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @OnEvent(DomainEvent.PAYMENT_RECORDED, { async: true })
  async onPaymentRecorded(event: PaymentRecordedEvent): Promise<void> {
    try {
      await runAsSystem('payment notifications', async () => {
        await this.notifications.create({
          tenantId: event.tenantId,
          branchId: event.branchId,
          customerId: event.customerId,
          orderId: event.orderId,
          type: NotificationType.PAYMENT_RECEIVED,
          title: NOTIFICATION_TITLE_FA[NotificationType.PAYMENT_RECEIVED],
          body: `پرداخت ${formatMoney(event.amount)} برای سفارش #${toPersianDigits(
            event.orderNumber,
          )} ثبت شد.`,
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to raise payment notification for order ${event.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * SMS is reserved for the handful of moments a customer actually wants a
   * phone buzz - not every internal state change.
   */
  private async maybeSendSms(event: OrderStatusChangedEvent): Promise<void> {
    if (!event.smsEnabled) return;
    if (!event.customerPhone) return;
    if (!SMS_WORTHY_STATUSES.includes(event.toStatus)) return;

    const orderNumber = toPersianDigits(event.orderNumber);
    const body =
      event.toStatus === OrderStatus.CANCELLED
        ? `${event.restaurantName}\nسفارش #${orderNumber} لغو شد.\nدر صورت نیاز با ما تماس بگیرید.`
        : `${event.restaurantName}\nسفارش #${orderNumber}\n${
            ORDER_STATUS_CUSTOMER_MESSAGE_FA[event.toStatus]
          }\nپیگیری: ${this.trackingUrl(event.trackingToken)}`;

    const messageId = await this.sms.enqueue({
      tenantId: event.tenantId,
      orderId: event.orderId,
      to: event.customerPhone,
      body,
    });

    if (messageId) {
      // Record that an SMS was raised, so the log shows both channels.
      await this.notifications.create({
        tenantId: event.tenantId,
        branchId: event.branchId,
        customerId: event.customerId,
        orderId: event.orderId,
        type: STATUS_NOTIFICATION_TYPE[event.toStatus],
        channel: NotificationChannel.SMS,
        title: NOTIFICATION_TITLE_FA[STATUS_NOTIFICATION_TYPE[event.toStatus]],
        body: `پیامک به ${event.customerPhone} ارسال شد.`,
        entityId: event.orderId,
      });
    }
  }
}
