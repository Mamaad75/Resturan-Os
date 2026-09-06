import { Inject, Injectable } from '@nestjs/common';
import { OrderStatus, OrderType, UserRole } from '@prisma/client';
import type {
  DeliveryZoneInput,
  DispatchOrderInput,
  UpdateDeliveryZoneInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';

/** A zone as the customer and the admin both see it. */
export interface DeliveryZoneDto {
  id: string;
  branchId: string;
  title: string;
  fee: number;
  minOrderTotal: number;
  estimatedMinutes: number;
  isActive: boolean;
  displayOrder: number;
}

interface ZoneRow {
  id: string;
  branchId: string;
  title: string;
  fee: number;
  minOrderTotal: number;
  estimatedMinutes: number;
  isActive: boolean;
  displayOrder: number;
}

export function toZoneDto(row: ZoneRow): DeliveryZoneDto {
  return {
    id: row.id,
    branchId: row.branchId,
    title: row.title,
    fee: row.fee,
    minOrderTotal: row.minOrderTotal,
    estimatedMinutes: row.estimatedMinutes,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
  };
}

/**
 * Courier delivery.
 *
 * Zones rather than distances: an Iranian address is a neighbourhood name and
 * a landmark, not a coordinate, so the restaurant prices areas it knows and
 * the customer picks the one they are in. The fee is copied onto the order at
 * creation time, so re-pricing a zone next month never rewrites what someone
 * was already charged.
 */
@Injectable()
export class DeliveryService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------- zones */

  async listZones(ctx: RequestContext, branchId?: string, activeOnly = false) {
    const rows = await this.prisma.deliveryZone.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(branchId ? { branchId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    });
    return rows.map(toZoneDto);
  }

  async createZone(ctx: RequestContext, branchId: string, input: DeliveryZoneInput) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: ctx.tenantId },
    });
    if (!branch) throw AppException.notFound('شعبه');

    const duplicate = await this.prisma.deliveryZone.findFirst({
      where: { tenantId: ctx.tenantId, branchId, title: input.title },
    });
    if (duplicate) {
      throw AppException.validation('منطقه‌ای با این نام قبلاً ثبت شده است.', {
        title: ['نام منطقه تکراری است.'],
      });
    }

    const row = await this.prisma.deliveryZone.create({
      data: {
        tenantId: ctx.tenantId,
        branchId,
        title: input.title,
        fee: input.fee,
        minOrderTotal: input.minOrderTotal ?? 0,
        estimatedMinutes: input.estimatedMinutes ?? 45,
        isActive: input.isActive ?? true,
        displayOrder: input.displayOrder ?? 0,
      },
    });
    return toZoneDto(row);
  }

  async updateZone(ctx: RequestContext, id: string, input: UpdateDeliveryZoneInput) {
    const existing = await this.prisma.deliveryZone.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw AppException.notFound('منطقه ارسال');

    if (input.title && input.title !== existing.title) {
      const duplicate = await this.prisma.deliveryZone.findFirst({
        where: {
          tenantId: ctx.tenantId,
          branchId: existing.branchId,
          title: input.title,
          id: { not: id },
        },
      });
      if (duplicate) {
        throw AppException.validation('منطقه‌ای با این نام قبلاً ثبت شده است.', {
          title: ['نام منطقه تکراری است.'],
        });
      }
    }

    const row = await this.prisma.deliveryZone.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.fee !== undefined ? { fee: input.fee } : {}),
        ...(input.minOrderTotal !== undefined
          ? { minOrderTotal: input.minOrderTotal }
          : {}),
        ...(input.estimatedMinutes !== undefined
          ? { estimatedMinutes: input.estimatedMinutes }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.displayOrder !== undefined
          ? { displayOrder: input.displayOrder }
          : {}),
      },
    });
    return toZoneDto(row);
  }

  async deleteZone(ctx: RequestContext, id: string) {
    const existing = await this.prisma.deliveryZone.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw AppException.notFound('منطقه ارسال');

    // Orders reference the zone for their history, so a used zone is retired
    // rather than deleted: deleting it would blank the zone on past orders.
    const used = await this.prisma.order.count({
      where: { tenantId: ctx.tenantId, deliveryZoneId: id },
    });
    if (used > 0) {
      const row = await this.prisma.deliveryZone.update({
        where: { id },
        data: { isActive: false },
      });
      return { deleted: false, zone: toZoneDto(row) };
    }

    await this.prisma.deliveryZone.delete({ where: { id } });
    return { deleted: true, zone: null };
  }

  /* --------------------------------------------------------- couriers */

  /** Staff who can carry an order. */
  async listCouriers(ctx: RequestContext) {
    const rows = await this.prisma.user.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        role: { in: [UserRole.COURIER, UserRole.WAITER] },
      },
      select: { id: true, fullName: true, role: true, phone: true },
      orderBy: { fullName: 'asc' },
    });
    return rows;
  }

  /* --------------------------------------------------------- dispatch */

  /**
   * The dispatch board: delivery orders that are not finished.
   *
   * A courier sees only their own; anyone else sees the branch's, including
   * the unassigned ones waiting for someone to take them.
   */
  async board(ctx: RequestContext, branchId?: string) {
    const mineOnly = ctx.role === UserRole.COURIER;
    const rows = await this.prisma.order.findMany({
      where: {
        tenantId: ctx.tenantId,
        type: OrderType.DELIVERY,
        ...(branchId ? { branchId } : {}),
        ...(mineOnly ? { courierId: ctx.userId } : {}),
        status: {
          in: [
            OrderStatus.CONFIRMED,
            OrderStatus.SENT_TO_KITCHEN,
            OrderStatus.PREPARING,
            OrderStatus.READY,
            OrderStatus.OUT_FOR_DELIVERY,
          ],
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        deliveryFee: true,
        deliveryAddress: true,
        deliveryNotes: true,
        customerName: true,
        customerPhone: true,
        dispatchedAt: true,
        createdAt: true,
        paymentStatus: true,
        deliveryZone: { select: { id: true, title: true, estimatedMinutes: true } },
        courier: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => ({
      ...row,
      dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Assign a courier without moving the order.
   *
   * Separate from dispatch on purpose: a counter often decides who is taking a
   * run before the food is out of the kitchen.
   */
  async assign(ctx: RequestContext, orderId: string, input: DispatchOrderInput) {
    const order = await this.requireDeliveryOrder(ctx, orderId);

    if (input.courierId) {
      await this.requireCourier(ctx, input.courierId);
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { courierId: input.courierId ?? null },
      select: {
        id: true,
        courierId: true,
        courier: { select: { id: true, fullName: true } },
      },
    });
    return updated;
  }

  private async requireDeliveryOrder(ctx: RequestContext, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      select: { id: true, type: true, status: true, courierId: true },
    });
    if (!order) throw AppException.notFound('سفارش');
    if (order.type !== OrderType.DELIVERY) {
      throw AppException.validation('این سفارش ارسال با پیک نیست.');
    }
    return order;
  }

  private async requireCourier(ctx: RequestContext, courierId: string) {
    const courier = await this.prisma.user.findFirst({
      where: {
        id: courierId,
        tenantId: ctx.tenantId,
        isActive: true,
        role: { in: [UserRole.COURIER, UserRole.WAITER] },
      },
      select: { id: true },
    });
    if (!courier) throw AppException.notFound('پیک');
    return courier;
  }
}
