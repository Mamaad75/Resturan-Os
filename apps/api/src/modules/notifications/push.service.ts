import { Inject, Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import type { PushSubscriptionInput } from '@restaurant-os/validation';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';

interface PushPayload {
  title: string;
  body: string;
  type: string;
  entityId: string | null;
  url?: string;
  tag?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly ready: boolean;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.ready = Boolean(config.push.vapidPublicKey && config.push.vapidPrivateKey);
    if (this.ready) {
      webpush.setVapidDetails(
        config.push.subject,
        config.push.vapidPublicKey!,
        config.push.vapidPrivateKey!,
      );
    } else {
      this.logger.warn('Web Push disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not configured.');
    }
  }

  configForClient() {
    return { enabled: this.ready, publicKey: this.ready ? this.config.push.vapidPublicKey : null };
  }

  async subscribe(ctx: RequestContext, input: PushSubscriptionInput) {
    // Operational push is a core reliability channel, not a restaurant-level
    // optional module. Browser/OS permission still applies, but once a device
    // grants it we always keep its subscription active.
    const row = await this.prisma.pushSubscription.upsert({
      where: { tenantId_endpoint: { tenantId: ctx.tenantId, endpoint: input.endpoint } },
      create: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        isActive: true,
      },
      update: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
        isActive: true,
      },
    });
    return { enabled: this.ready, subscribed: true, id: row.id };
  }

  async unsubscribe(ctx: RequestContext, endpoint: string) {
    const result = await this.prisma.pushSubscription.updateMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId, endpoint },
      data: { isActive: false },
    });
    return { unsubscribed: result.count };
  }

  async sendToUser(tenantId: string, userId: string | null, payload: PushPayload) {
    if (!this.ready || !userId) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { tenantId, userId, isActive: true },
      take: 8,
    });
    if (!subscriptions.length) return;

    const body = JSON.stringify(payload);
    await Promise.allSettled(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { TTL: 90, urgency: 'high' },
        );
        await this.prisma.pushSubscription.update({
          where: { id: subscription.id, tenantId },
          data: { lastUsedAt: new Date(), isActive: true },
        });
      } catch (error: unknown) {
        const statusCode = typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : 0;
        if (statusCode === 404 || statusCode === 410) {
          await this.prisma.pushSubscription.update({
            where: { id: subscription.id, tenantId }, data: { isActive: false },
          });
          return;
        }
        this.logger.warn(`Push delivery failed for subscription ${subscription.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  }
}
