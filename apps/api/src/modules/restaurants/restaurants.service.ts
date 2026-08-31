import { Inject, Injectable } from '@nestjs/common';
import {
  AuditAction,
  menuTemplateSpec,
  modesFromServiceMode,
  serviceModeFromModes,
  type PublicRestaurant,
  type RestaurantBranding,
  type RestaurantSettings,
} from '@restaurant-os/types';
import type {
  CreateBranchInput,
  UpdateBrandingInput,
  UpdateBranchInput,
  UpdateRestaurantInput,
  UpdateSettingsInput,
} from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';

@Injectable()
export class RestaurantsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Context helpers used by every other module                          */
  /* ------------------------------------------------------------------ */

  /**
   * Resolves which branch a request operates on.
   *
   * A staff member pinned to a branch can never act on another one, even by
   * passing a different id explicitly.
   */
  async resolveBranchId(ctx: RequestContext, requested?: string): Promise<string> {
    if (requested) {
      if (ctx.branchId && ctx.branchId !== requested) {
        throw AppException.forbidden('شما فقط به شعبه خود دسترسی دارید.');
      }
      const branch = await this.prisma.branch.findFirst({
        where: { id: requested, tenantId: ctx.tenantId, isActive: true },
        select: { id: true },
      });
      if (!branch) throw AppException.notFound('شعبه');
      return branch.id;
    }

    if (ctx.branchId) return ctx.branchId;

    const first = await this.prisma.branch.findFirst({
      where: { tenantId: ctx.tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!first) throw AppException.notFound('شعبه فعالی');
    return first.id;
  }

  async getRestaurantEntity(tenantId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    if (!restaurant) throw AppException.notFound('رستوران');
    return restaurant;
  }

  /** The active menu of a branch, creating one on first use. */
  async getOrCreateMenuId(tenantId: string, branchId: string): Promise<string> {
    const existing = await this.prisma.menu.findFirst({
      where: { tenantId, branchId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing.id;

    const created = await this.prisma.menu.create({
      data: { tenantId, branchId },
      select: { id: true },
    });
    return created.id;
  }

  /* ------------------------------------------------------------------ */
  /* Admin surface                                                       */
  /* ------------------------------------------------------------------ */

  async getForAdmin(ctx: RequestContext) {
    const restaurant = await this.getRestaurantEntity(ctx.tenantId);
    const branches = await this.prisma.branch.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      description: restaurant.description,
      branding: toBranding(restaurant),
      settings: toSettings(restaurant),
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        address: b.address,
        phone: b.phone,
        isOpen: b.isOpen,
        isActive: b.isActive,
      })),
      publicUrl: `/r/${restaurant.slug}`,
    };
  }

  async updateRestaurant(ctx: RequestContext, input: UpdateRestaurantInput) {
    const restaurant = await this.getRestaurantEntity(ctx.tenantId);
    if (input.slug && input.slug !== restaurant.slug) {
      await this.assertSlugAvailable(input.slug);
    }
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurant.id, tenantId: ctx.tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.SETTINGS_CHANGE,
      entity: 'Restaurant',
      entityId: restaurant.id,
      metadata: { fields: Object.keys(input) },
    });
    return this.getForAdmin(ctx);
  }

  async updateBranding(ctx: RequestContext, input: UpdateBrandingInput) {
    const restaurant = await this.getRestaurantEntity(ctx.tenantId);
    await this.prisma.restaurant.update({
      where: { id: restaurant.id, tenantId: ctx.tenantId },
      data: {
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
        ...(input.primaryColor !== undefined
          ? { primaryColor: input.primaryColor }
          : {}),
        ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
        ...(input.menuTemplate !== undefined
          ? { menuTemplate: input.menuTemplate }
          : {}),
      },
    });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.SETTINGS_CHANGE,
      entity: 'Restaurant.branding',
      entityId: restaurant.id,
      metadata: { fields: Object.keys(input) },
    });
    return this.getForAdmin(ctx);
  }

  async updateSettings(ctx: RequestContext, input: UpdateSettingsInput) {
    const restaurant = await this.getRestaurantEntity(ctx.tenantId);

    /*
     * `serviceMode` is the single-choice control the settings page shows;
     * `serviceModes` is the array that has always been stored and that
     * existing integrations still send. Accepting both keeps the API
     * backward compatible, and the single choice wins when both arrive.
     */
    const serviceModes = input.serviceMode
      ? (modesFromServiceMode(
          input.serviceMode,
          restaurant.serviceModes,
        ) as UpdateSettingsInput['serviceModes'])
      : input.serviceModes;

    // A plan that does not sell a service mode cannot have it switched on.
    if (serviceModes) {
      const features = (await this.plans.entitlements(ctx.tenantId)).features;
      if (serviceModes.includes('DINE_IN') && !features.dineInEnabled) {
        await this.plans.requireFeature(ctx.tenantId, 'dineInEnabled');
      }
      if (serviceModes.includes('TAKEAWAY') && !features.takeawayEnabled) {
        await this.plans.requireFeature(ctx.tenantId, 'takeawayEnabled');
      }
    }

    await this.prisma.restaurant.update({
      where: { id: restaurant.id, tenantId: ctx.tenantId },
      data: {
        ...(serviceModes !== undefined ? { serviceModes } : {}),
        ...(input.businessType !== undefined
          ? { businessType: input.businessType }
          : {}),
        ...(input.requireCustomerPhone !== undefined
          ? { requireCustomerPhone: input.requireCustomerPhone }
          : {}),
        ...(input.marketingOptInEnabled !== undefined
          ? { marketingOptInEnabled: input.marketingOptInEnabled }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.taxEnabled !== undefined ? { taxEnabled: input.taxEnabled } : {}),
        ...(input.taxRateBps !== undefined ? { taxRateBps: input.taxRateBps } : {}),
        ...(input.serviceChargeEnabled !== undefined
          ? { serviceChargeEnabled: input.serviceChargeEnabled }
          : {}),
        ...(input.serviceChargeBps !== undefined
          ? { serviceChargeBps: input.serviceChargeBps }
          : {}),
        ...(input.estimatedPrepMinutes !== undefined
          ? { estimatedPrepMinutes: input.estimatedPrepMinutes }
          : {}),
        ...(input.smsNotificationsEnabled !== undefined
          ? { smsNotificationsEnabled: input.smsNotificationsEnabled }
          : {}),
        ...(input.autoConfirmOrders !== undefined
          ? { autoConfirmOrders: input.autoConfirmOrders }
          : {}),
      },
    });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.SETTINGS_CHANGE,
      entity: 'Restaurant.settings',
      entityId: restaurant.id,
      metadata: input as Record<string, unknown>,
    });
    return this.getForAdmin(ctx);
  }

  async listBranches(ctx: RequestContext) {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return branches.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      address: b.address,
      phone: b.phone,
      isOpen: b.isOpen,
      isActive: b.isActive,
    }));
  }

  /**
   * Opens a new branch.
   *
   * Two gates, both server-side: the plan has to include multi-branch at all,
   * and the tenant has to be under its branch ceiling. A tenant on a
   * single-branch plan gets a clear message rather than a silent failure.
   */
  async createBranch(ctx: RequestContext, input: CreateBranchInput) {
    await this.plans.requireFeature(ctx.tenantId, 'multiBranchEnabled');
    await this.plans.requireCapacity(ctx.tenantId, 'maxBranches');

    const restaurant = await this.getRestaurantEntity(ctx.tenantId);

    const clash = await this.prisma.branch.findFirst({
      // restaurantId already implies the tenant, but the isolation guard wants
      // it stated: an implied scope is exactly the kind it exists to catch.
      where: { tenantId: ctx.tenantId, restaurantId: restaurant.id, slug: input.slug },
      select: { id: true },
    });
    if (clash) {
      throw AppException.conflict('شعبه‌ای با این نشانی از قبل وجود دارد.');
    }

    const branch = await this.prisma.branch.create({
      data: {
        tenantId: ctx.tenantId,
        restaurantId: restaurant.id,
        name: input.name,
        slug: input.slug,
        address: input.address ?? null,
        phone: input.phone ?? null,
      },
    });

    // A branch without a menu cannot take an order; create it up front rather
    // than lazily on the first request.
    await this.getOrCreateMenuId(ctx.tenantId, branch.id);

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.CREATE,
      entity: 'Branch',
      entityId: branch.id,
      metadata: { name: branch.name, slug: branch.slug },
    });

    return {
      id: branch.id,
      name: branch.name,
      slug: branch.slug,
      address: branch.address,
      phone: branch.phone,
      isOpen: branch.isOpen,
      isActive: branch.isActive,
    };
  }

  async updateBranch(ctx: RequestContext, branchId: string, input: UpdateBranchInput) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: ctx.tenantId },
    });
    if (!branch) throw AppException.notFound('شعبه');

    const updated = await this.prisma.branch.update({
      where: { id: branch.id, tenantId: ctx.tenantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.isOpen !== undefined ? { isOpen: input.isOpen } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.SETTINGS_CHANGE,
      entity: 'Branch',
      entityId: branch.id,
      metadata: { fields: Object.keys(input) },
    });
    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      address: updated.address,
      phone: updated.phone,
      isOpen: updated.isOpen,
      isActive: updated.isActive,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Public surface (QR / customer app)                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Resolves a public restaurant slug. This is inherently a cross-tenant read:
   * the caller is an anonymous customer and the slug is what identifies the
   * tenant in the first place.
   */
  async findPublicBySlug(
    slug: string,
    tableNumber?: number,
  ): Promise<{
    tenantId: string;
    branchId: string;
    menuId: string | null;
    publicRestaurant: PublicRestaurant;
  }> {
    const restaurant = await runAsSystem(
      'public menu: resolve restaurant by slug',
      () =>
        this.prisma.restaurant.findFirst({
          where: { slug },
          include: {
            tenant: { select: { isActive: true } },
            branches: {
              where: { isActive: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
              include: {
                menus: {
                  where: { isActive: true },
                  orderBy: { createdAt: 'asc' },
                  take: 1,
                  select: { id: true },
                },
              },
            },
          },
        }),
    );

    if (!restaurant || !restaurant.tenant.isActive) {
      throw AppException.notFound('رستوران');
    }
    const branch = restaurant.branches[0];
    if (!branch) throw AppException.notFound('شعبه فعالی برای این رستوران');

    let table: { id: string; number: number; name: string | null } | null = null;
    if (tableNumber != null) {
      const found = await this.prisma.restaurantTable.findFirst({
        where: {
          tenantId: restaurant.tenantId,
          branchId: branch.id,
          number: tableNumber,
        },
        select: { id: true, number: true, name: true, status: true },
      });
      if (found && found.status !== 'DISABLED') {
        table = { id: found.id, number: found.number, name: found.name };
      }
    }

    return {
      tenantId: restaurant.tenantId,
      branchId: branch.id,
      menuId: branch.menus[0]?.id ?? null,
      publicRestaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        description: restaurant.description,
        branding: toBranding(restaurant),
        settings: toSettings(restaurant),
        branch: {
          id: branch.id,
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
          isOpen: branch.isOpen,
        },
        table,
      },
    };
  }

  private async assertSlugAvailable(slug: string): Promise<void> {
    const clash = await runAsSystem('slug uniqueness check across platform', () =>
      this.prisma.restaurant.findFirst({ where: { slug }, select: { id: true } }),
    );
    if (clash) {
      throw AppException.conflict('این نشانی قبلاً استفاده شده است.');
    }
  }
}

export function toBranding(row: {
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string;
  accentColor: string;
  theme: string;
  tagline: string | null;
  menuTemplate: string;
}): RestaurantBranding {
  return {
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    primaryColor: row.primaryColor,
    accentColor: row.accentColor,
    theme: row.theme === 'light' ? 'light' : 'dark',
    tagline: row.tagline,
    // Normalised through the spec lookup so a value written by an older
    // release, or a template that has since been removed, still renders.
    menuTemplate: menuTemplateSpec(row.menuTemplate).id,
  };
}

export function toSettings(row: {
  businessType: string;
  serviceModes: string[];
  requireCustomerPhone: boolean;
  marketingOptInEnabled: boolean;
  currency: string;
  taxEnabled: boolean;
  taxRateBps: number;
  serviceChargeEnabled: boolean;
  serviceChargeBps: number;
  estimatedPrepMinutes: number;
  smsNotificationsEnabled: boolean;
  autoConfirmOrders: boolean;
}): RestaurantSettings {
  return {
    businessType: row.businessType as RestaurantSettings['businessType'],
    serviceMode: serviceModeFromModes(row.serviceModes),
    serviceModes: row.serviceModes as RestaurantSettings['serviceModes'],
    requireCustomerPhone: row.requireCustomerPhone,
    marketingOptInEnabled: row.marketingOptInEnabled,
    currency: row.currency as RestaurantSettings['currency'],
    taxEnabled: row.taxEnabled,
    taxRateBps: row.taxRateBps,
    serviceChargeEnabled: row.serviceChargeEnabled,
    serviceChargeBps: row.serviceChargeBps,
    estimatedPrepMinutes: row.estimatedPrepMinutes,
    smsNotificationsEnabled: row.smsNotificationsEnabled,
    autoConfirmOrders: row.autoConfirmOrders,
  };
}
