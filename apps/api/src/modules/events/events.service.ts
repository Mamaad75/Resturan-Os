import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateEventInput,
  EventRsvpInput,
  UpdateEventInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { QrService } from '../qr/qr.service';
import { RestaurantsService } from '../restaurants/restaurants.service';

interface EventRow {
  id: string;
  branchId: string | null;
  title: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  accentColor: string | null;
  theme: string | null;
  menuTemplate: string | null;
  menuId: string | null;
  capacity: number | null;
  rsvpEnabled: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

function toEventDto(row: EventRow) {
  return {
    id: row.id,
    branchId: row.branchId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    coverUrl: row.coverUrl,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    accentColor: row.accentColor,
    theme: row.theme,
    menuTemplate: row.menuTemplate,
    menuId: row.menuId,
    capacity: row.capacity,
    rsvpEnabled: row.rsvpEnabled,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Cafe/restaurant events.
 *
 * An owner defines events (a live-music night, a launch, a workshop) with an
 * optional per-event look and menu, and each event has a public page at
 * /r/<slug>/e/<eventSlug> plus a dedicated QR rendered from that path. Events
 * can collect RSVPs up to a capacity.
 */
@Injectable()
export class EventsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly qr: QrService,
    private readonly restaurants: RestaurantsService,
  ) {}

  /* --------------------------------------------------------------- admin */

  async list(ctx: RequestContext) {
    const rows = await this.prisma.event.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ displayOrder: 'asc' }, { startsAt: 'desc' }],
    });
    return rows.map(toEventDto);
  }

  async create(ctx: RequestContext, input: CreateEventInput) {
    await this.assertSlugFree(ctx.tenantId, input.slug);
    if (input.branchId) await this.assertBranch(ctx.tenantId, input.branchId);
    if (input.menuId) await this.assertMenu(ctx.tenantId, input.menuId);

    const row = await this.prisma.event.create({
      data: {
        tenantId: ctx.tenantId,
        title: input.title,
        slug: input.slug,
        description: input.description ?? null,
        coverUrl: input.coverUrl ?? null,
        branchId: input.branchId ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        accentColor: input.accentColor ?? null,
        theme: input.theme ?? null,
        menuTemplate: input.menuTemplate ?? null,
        menuId: input.menuId ?? null,
        capacity: input.capacity ?? null,
        rsvpEnabled: input.rsvpEnabled ?? false,
        isActive: input.isActive ?? true,
        displayOrder: input.displayOrder ?? 0,
      },
    });
    return toEventDto(row);
  }

  async update(ctx: RequestContext, id: string, input: UpdateEventInput) {
    const existing = await this.prisma.event.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw AppException.notFound('رویداد');

    if (input.slug && input.slug !== existing.slug) {
      await this.assertSlugFree(ctx.tenantId, input.slug);
    }
    if (input.branchId) await this.assertBranch(ctx.tenantId, input.branchId);
    if (input.menuId) await this.assertMenu(ctx.tenantId, input.menuId);

    const row = await this.prisma.event.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
        ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
        ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
        ...(input.endsAt !== undefined
          ? { endsAt: input.endsAt ? new Date(input.endsAt) : null }
          : {}),
        ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.menuTemplate !== undefined
          ? { menuTemplate: input.menuTemplate }
          : {}),
        ...(input.menuId !== undefined ? { menuId: input.menuId } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.rsvpEnabled !== undefined ? { rsvpEnabled: input.rsvpEnabled } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.displayOrder !== undefined
          ? { displayOrder: input.displayOrder }
          : {}),
      },
    });
    return toEventDto(row);
  }

  async remove(ctx: RequestContext, id: string) {
    const existing = await this.prisma.event.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) throw AppException.notFound('رویداد');
    await this.prisma.event.delete({ where: { id } });
    return { deleted: true };
  }

  async listRsvps(ctx: RequestContext, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenantId: ctx.tenantId },
      select: { id: true, capacity: true },
    });
    if (!event) throw AppException.notFound('رویداد');

    const rows = await this.prisma.eventRsvp.findMany({
      where: { tenantId: ctx.tenantId, eventId },
      orderBy: { createdAt: 'desc' },
    });
    const reserved = rows
      .filter((r) => r.status !== 'CANCELLED')
      .reduce((sum, r) => sum + r.guests, 0);
    return {
      capacity: event.capacity,
      reserved,
      spotsLeft: event.capacity != null ? Math.max(0, event.capacity - reserved) : null,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        guests: r.guests,
        status: r.status,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** The dedicated QR for an event's public page, as a data URL. */
  async qrDataUrl(ctx: RequestContext, id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { slug: true },
    });
    if (!event) throw AppException.notFound('رویداد');
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { tenantId: ctx.tenantId },
      select: { slug: true },
    });
    if (!restaurant) throw AppException.notFound('رستوران');
    const targetPath = `/r/${restaurant.slug}/e/${event.slug}`;
    const dataUrl = await this.qr.renderDataUrl(targetPath, 360);
    return { targetPath, dataUrl };
  }

  /* -------------------------------------------------------------- public */

  async publicList(slug: string) {
    const resolved = await this.restaurants.findPublicBySlug(slug);
    const rows = await runAsSystem('events: public list', () =>
      this.prisma.event.findMany({
        where: { tenantId: resolved.tenantId, isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { startsAt: 'asc' }],
      }),
    );
    return {
      restaurant: resolved.publicRestaurant,
      events: rows.map(toEventDto),
    };
  }

  async publicGet(slug: string, eventSlug: string) {
    const resolved = await this.restaurants.findPublicBySlug(slug);
    const event = await runAsSystem('events: public get', () =>
      this.prisma.event.findFirst({
        where: { tenantId: resolved.tenantId, slug: eventSlug, isActive: true },
      }),
    );
    if (!event) throw AppException.notFound('رویداد');

    const reserved = await this.reservedCount(event.id);
    return {
      restaurant: resolved.publicRestaurant,
      event: toEventDto(event as EventRow),
      spotsLeft:
        event.capacity != null ? Math.max(0, event.capacity - reserved) : null,
    };
  }

  async rsvp(slug: string, eventSlug: string, input: EventRsvpInput) {
    const resolved = await this.restaurants.findPublicBySlug(slug);
    return runAsSystem('events: rsvp', async () => {
      const event = await this.prisma.event.findFirst({
        where: { tenantId: resolved.tenantId, slug: eventSlug, isActive: true },
      });
      if (!event) throw AppException.notFound('رویداد');
      if (!event.rsvpEnabled) {
        throw AppException.validation('ثبت‌نام برای این رویداد فعال نیست.');
      }
      if (event.capacity != null) {
        const reserved = await this.reservedCount(event.id);
        if (reserved + input.guests > event.capacity) {
          throw AppException.validation('ظرفیت این رویداد تکمیل شده است.', {
            guests: [`فقط ${Math.max(0, event.capacity - reserved)} جای خالی مانده است.`],
          });
        }
      }
      const row = await this.prisma.eventRsvp.create({
        data: {
          tenantId: resolved.tenantId,
          eventId: event.id,
          name: input.name,
          phone: input.phone,
          guests: input.guests,
          note: input.note ?? null,
        },
      });
      return { id: row.id, status: row.status };
    });
  }

  /* -------------------------------------------------------------- helpers */

  private async reservedCount(eventId: string): Promise<number> {
    const agg = await runAsSystem('events: reserved count', () =>
      this.prisma.eventRsvp.aggregate({
        where: { eventId, status: { not: 'CANCELLED' } },
        _sum: { guests: true },
      }),
    );
    return agg._sum.guests ?? 0;
  }

  private async assertSlugFree(tenantId: string, slug: string) {
    const dup = await this.prisma.event.findFirst({
      where: { tenantId, slug },
      select: { id: true },
    });
    if (dup) {
      throw AppException.validation('رویدادی با این نشانی قبلاً ثبت شده است.', {
        slug: ['نشانی رویداد تکراری است.'],
      });
    }
  }

  private async assertBranch(tenantId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
      select: { id: true },
    });
    if (!branch) throw AppException.notFound('شعبه');
  }

  private async assertMenu(tenantId: string, menuId: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { id: menuId, tenantId },
      select: { id: true },
    });
    if (!menu) throw AppException.notFound('منو');
  }
}
