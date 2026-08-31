import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  diffFromPreset,
  menuTemplateSpec,
  resolveTheme,
  type DeepPartial,
  type MenuThemeConfig,
  type MenuThemeDto,
} from '@restaurant-os/types';
import type { UpdateMenuThemeInput } from '@restaurant-os/validation';
import { AuditAction } from '@restaurant-os/types';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlansService } from '../plans/plans.service';
import { RestaurantsService } from '../restaurants/restaurants.service';

/** Prisma will not take an arbitrary object for a Json column without this. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

/**
 * The customer menu's appearance.
 *
 * Stored as preset + overrides rather than a full config, which is what makes
 * "reset to preset" a delete instead of a reconstruction, and what lets a new
 * knob appear in a later release without every saved theme needing a migration.
 *
 * Draft and published are separate columns. The owner edits the draft, the
 * guest sees the published one, and publishing is an explicit act.
 */
@Injectable()
export class ThemeService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly plans: PlansService,
    private readonly audit: AuditService,
  ) {}

  /** The admin view: draft if there is one, otherwise what is published. */
  async getForAdmin(ctx: RequestContext): Promise<MenuThemeDto> {
    const row = await this.load(ctx.tenantId);
    const overrides = (row.draft ?? row.published ?? {}) as DeepPartial<MenuThemeConfig>;
    return {
      preset: menuTemplateSpec(row.preset).id,
      config: resolveTheme(row.preset, overrides),
      overrides,
      customCss: row.customCss,
      hasDraft: row.draft !== null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    };
  }

  /**
   * What a guest gets. Only ever the published theme - an unpublished draft
   * must not leak onto the live menu.
   */
  async getPublished(restaurantId: string, tenantId: string) {
    const row = await this.prisma.menuTheme.findFirst({
      where: { restaurantId, tenantId },
    });
    if (!row) return null;
    return {
      preset: menuTemplateSpec(row.preset).id,
      config: resolveTheme(row.preset, row.published as DeepPartial<MenuThemeConfig>),
      customCss: row.customCss,
    };
  }

  async update(
    ctx: RequestContext,
    input: UpdateMenuThemeInput,
  ): Promise<MenuThemeDto> {
    const row = await this.load(ctx.tenantId);

    /*
     * Two separate gates. Touching the config at all needs the basic
     * customizer; custom CSS is a higher tier again. Both are checked here
     * rather than in the UI, because this endpoint is reachable directly.
     */
    if (input.config !== undefined || input.preset !== undefined) {
      await this.plans.requireFeature(ctx.tenantId, 'customThemeEnabled');
    }
    if (input.customCss !== undefined) {
      await this.plans.requireFeature(ctx.tenantId, 'customCssEnabled');
    }

    const preset = input.preset ?? row.preset;

    /*
     * Only the differences from the preset are stored. A theme saved against
     * one preset and then switched to another therefore keeps the owner's
     * deliberate choices and inherits everything else from the new preset.
     */
    const overrides =
      input.config !== undefined
        ? diffFromPreset(
            preset,
            resolveTheme(preset, input.config as DeepPartial<MenuThemeConfig>),
          )
        : ((input.preset !== undefined
            ? (row.draft ?? row.published)
            : (row.draft ?? row.published)) as DeepPartial<MenuThemeConfig> | null);

    const publishing = input.publish === true;
    const now = new Date();

    const updated = await this.prisma.menuTheme.update({
      where: { id: row.id },
      data: {
        preset,
        ...(publishing
          ? {
              published: toJson(overrides),
              // Publishing consumes the draft: what is live and what is being
              // edited are the same thing again. `DbNull` is a real SQL NULL,
              // which is how "no draft" is distinguished from "a draft that
              // happens to be empty".
              draft: Prisma.DbNull,
              publishedAt: now,
            }
          : { draft: toJson(overrides) }),
        ...(input.customCss !== undefined
          ? { customCss: input.customCss === '' ? null : input.customCss }
          : {}),
      },
    });

    // The legacy `menuTemplate` column still drives anything reading the
    // restaurant directly; keeping it in step avoids two sources of truth.
    if (input.preset !== undefined) {
      const restaurant = await this.restaurants.getRestaurantEntity(ctx.tenantId);
      await this.prisma.restaurant.update({
        where: { id: restaurant.id, tenantId: ctx.tenantId },
        data: { menuTemplate: preset },
      });
    }

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.SETTINGS_CHANGE,
      entity: 'MenuTheme',
      entityId: updated.id,
      metadata: { preset, published: publishing, customCss: input.customCss !== undefined },
    });

    return this.getForAdmin(ctx);
  }

  /** Drops every override, returning the menu to the preset as shipped. */
  async reset(ctx: RequestContext, publish = false): Promise<MenuThemeDto> {
    await this.plans.requireFeature(ctx.tenantId, 'customThemeEnabled');
    const row = await this.load(ctx.tenantId);

    await this.prisma.menuTheme.update({
      where: { id: row.id },
      data: publish
        ? { published: {}, draft: Prisma.DbNull, publishedAt: new Date() }
        : { draft: {} },
    });

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.SETTINGS_CHANGE,
      entity: 'MenuTheme',
      entityId: row.id,
      metadata: { reset: true, published: publish },
    });
    return this.getForAdmin(ctx);
  }

  /** Throws away the draft, leaving the live menu untouched. */
  async discardDraft(ctx: RequestContext): Promise<MenuThemeDto> {
    const row = await this.load(ctx.tenantId);
    await this.prisma.menuTheme.update({
      where: { id: row.id },
      data: { draft: Prisma.DbNull },
    });
    return this.getForAdmin(ctx);
  }

  /**
   * The tenant's theme row, created on first access.
   *
   * Lazy creation keeps existing restaurants working without a backfill having
   * to have run, and starts them on the preset their menu already uses.
   */
  private async load(tenantId: string) {
    const restaurant = await this.restaurants.getRestaurantEntity(tenantId);
    const existing = await this.prisma.menuTheme.findFirst({
      where: { restaurantId: restaurant.id, tenantId },
    });
    if (existing) return existing;

    return this.prisma.menuTheme.create({
      data: {
        tenantId,
        restaurantId: restaurant.id,
        preset: restaurant.menuTemplate,
      },
    });
  }
}
