import { Inject, Injectable } from '@nestjs/common';
import { NotificationType } from '@restaurant-os/types';
import type { GrantMembershipInput, MembershipPlanInput } from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService, type PrismaTransaction } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface MembershipQuote {
  membershipId: string | null;
  discount: number;
  freeDelivery: boolean;
  loyaltyMultiplierBps: number;
  planName: string | null;
}

@Injectable()
export class MembershipsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async assertEnabled(tenantId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { tenantId },
      select: { customerMembershipEnabled: true },
    });
    if (!restaurant?.customerMembershipEnabled) {
      throw AppException.forbidden('اشتراک مشتریان برای این مجموعه فعال نشده است. از تنظیمات فعالش کنید.');
    }
  }

  async listPlans(ctx: RequestContext) {
    await this.assertEnabled(ctx.tenantId);
    return this.prisma.customerMembershipPlan.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ isActive: 'desc' }, { price: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createPlan(ctx: RequestContext, input: MembershipPlanInput) {
    await this.assertEnabled(ctx.tenantId);
    return this.prisma.customerMembershipPlan.create({
      data: { tenantId: ctx.tenantId, ...input },
    });
  }

  async updatePlan(ctx: RequestContext, id: string, input: Partial<MembershipPlanInput>) {
    await this.assertEnabled(ctx.tenantId);
    const plan = await this.prisma.customerMembershipPlan.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!plan) throw AppException.notFound('پلن اشتراک');
    return this.prisma.customerMembershipPlan.update({ where: { id, tenantId: ctx.tenantId }, data: input });
  }

  async listMemberships(ctx: RequestContext, status?: string) {
    await this.assertEnabled(ctx.tenantId);
    const now = new Date();
    await this.prisma.customerMembership.updateMany({
      where: { tenantId: ctx.tenantId, status: 'ACTIVE', endsAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });
    return this.prisma.customerMembership.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(status ? { status: status.toUpperCase() } : {}),
      },
      include: {
        customer: { select: { id: true, phone: true, name: true, loyaltyPoints: true } },
        plan: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
  }

  async grant(ctx: RequestContext, input: GrantMembershipInput) {
    await this.assertEnabled(ctx.tenantId);
    const plan = await this.prisma.customerMembershipPlan.findFirst({
      where: { id: input.planId, tenantId: ctx.tenantId, isActive: true },
    });
    if (!plan) throw AppException.notFound('پلن اشتراک');

    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const endsAt = new Date(startsAt.getTime() + plan.durationDays * 86_400_000);
    const amount = input.gifted ? 0 : (input.amount ?? plan.price);

    const membership = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { tenantId_phone: { tenantId: ctx.tenantId, phone: input.phone } },
        create: {
          tenantId: ctx.tenantId,
          phone: input.phone,
          name: input.name ?? null,
        },
        update: input.name ? { name: input.name } : {},
      });

      // Only one active entitlement is allowed at a time. Historical rows are
      // retained for accounting/audit, while the new grant becomes authoritative.
      await tx.customerMembership.updateMany({
        where: { tenantId: ctx.tenantId, customerId: customer.id, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED', cancelledAt: new Date() },
      });

      const created = await tx.customerMembership.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: customer.id,
          planId: plan.id,
          startsAt,
          endsAt,
          gifted: input.gifted,
          grantedByUserId: ctx.userId,
        },
        include: { customer: true, plan: true },
      });

      if (!input.gifted || amount > 0) {
        await tx.membershipPayment.create({
          data: {
            tenantId: ctx.tenantId,
            membershipId: created.id,
            amount,
            method: input.paymentMethod,
            reference: input.reference ?? null,
          },
        });
      }

      return created;
    });

    const recipients = await this.notifications.staffRecipients(ctx.tenantId, ctx.branchId ?? '', [
      'OWNER', 'MANAGER', 'CASHIER',
    ]).catch(() => []);
    if (recipients.length) {
      await this.notifications.createMany(
        recipients.map((userId) => ({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId ?? null,
          userId,
          customerId: membership.customerId,
          type: NotificationType.SYSTEM,
          title: input.gifted ? 'اشتراک هدیه فعال شد' : 'اشتراک مشتری فروخته شد',
          body: `${membership.customer.name ?? membership.customer.phone} — ${plan.name}`,
          entityId: membership.id,
        })),
      );
    }

    return membership;
  }

  async cancel(ctx: RequestContext, id: string, reason?: string | null) {
    await this.assertEnabled(ctx.tenantId);
    const existing = await this.prisma.customerMembership.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { plan: true, customer: true },
    });
    if (!existing) throw AppException.notFound('اشتراک مشتری');
    if (existing.status !== 'ACTIVE') return existing;
    const row = await this.prisma.customerMembership.update({
      where: { id, tenantId: ctx.tenantId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: { plan: true, customer: true },
    });
    if (reason) {
      await this.prisma.membershipUsage.create({
        data: {
          tenantId: ctx.tenantId,
          membershipId: id,
          benefitType: 'CANCELLATION_NOTE',
          quantity: 0,
          note: reason,
        },
      });
    }
    return row;
  }

  /**
   * Authoritative active-membership quote used from inside the order transaction.
   * It intentionally returns a neutral quote when the feature is disabled, so a
   * restaurant can toggle memberships off without breaking checkout.
   */
  async quote(
    tx: PrismaTransaction,
    tenantId: string,
    customerId: string | null,
    foodSubtotalAfterOtherDiscounts: number,
  ): Promise<MembershipQuote> {
    if (!customerId) return noMembership();
    const restaurant = await tx.restaurant.findFirst({
      where: { tenantId },
      select: { customerMembershipEnabled: true },
    });
    if (!restaurant?.customerMembershipEnabled) return noMembership();

    const now = new Date();
    const membership = await tx.customerMembership.findFirst({
      where: {
        tenantId,
        customerId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      include: { plan: true },
      orderBy: { endsAt: 'desc' },
    });
    if (!membership || !membership.plan.isActive) return noMembership();

    const base = Math.max(0, foodSubtotalAfterOtherDiscounts);
    const discount = Math.min(base, Math.floor((base * membership.plan.discountBps) / 10_000));
    return {
      membershipId: membership.id,
      discount,
      freeDelivery: membership.plan.freeDelivery,
      loyaltyMultiplierBps: Math.max(10_000, membership.plan.loyaltyMultiplierBps),
      planName: membership.plan.name,
    };
  }

  async recordUsage(
    tx: PrismaTransaction,
    args: { tenantId: string; membershipId: string | null; orderId: string; discount: number; freeDeliverySaved: number },
  ) {
    if (!args.membershipId) return;
    const rows: Array<{ tenantId: string; membershipId: string; benefitType: string; quantity: number; orderId: string; note?: string }> = [];
    if (args.discount > 0) {
      rows.push({
        tenantId: args.tenantId,
        membershipId: args.membershipId,
        benefitType: 'ORDER_DISCOUNT',
        quantity: 1,
        orderId: args.orderId,
        note: `${args.discount} تومان تخفیف اشتراک`,
      });
    }
    if (args.freeDeliverySaved > 0) {
      rows.push({
        tenantId: args.tenantId,
        membershipId: args.membershipId,
        benefitType: 'FREE_DELIVERY',
        quantity: 1,
        orderId: args.orderId,
        note: `${args.freeDeliverySaved} تومان هزینه ارسال رایگان شد`,
      });
    }
    if (rows.length) await tx.membershipUsage.createMany({ data: rows });
  }


  async loyaltyMultiplierTx(tx: PrismaTransaction, tenantId: string, customerId: string): Promise<number> {
    const restaurant = await tx.restaurant.findFirst({
      where: { tenantId }, select: { customerMembershipEnabled: true },
    });
    if (!restaurant?.customerMembershipEnabled) return 10_000;
    const now = new Date();
    const row = await tx.customerMembership.findFirst({
      where: { tenantId, customerId, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      include: { plan: true },
      orderBy: { endsAt: 'desc' },
    });
    return row?.plan.isActive ? Math.max(10_000, row.plan.loyaltyMultiplierBps) : 10_000;
  }

  /** Multiplier used when a completed order earns loyalty points. */
  async loyaltyMultiplier(tenantId: string, customerId: string): Promise<number> {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { tenantId }, select: { customerMembershipEnabled: true },
    });
    if (!restaurant?.customerMembershipEnabled) return 10_000;
    const now = new Date();
    const row = await this.prisma.customerMembership.findFirst({
      where: { tenantId, customerId, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      include: { plan: true },
      orderBy: { endsAt: 'desc' },
    });
    return row?.plan.isActive ? Math.max(10_000, row.plan.loyaltyMultiplierBps) : 10_000;
  }
}

function noMembership(): MembershipQuote {
  return { membershipId: null, discount: 0, freeDelivery: false, loyaltyMultiplierBps: 10_000, planName: null };
}
