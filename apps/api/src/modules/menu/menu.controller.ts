import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import { slugSchema } from '@restaurant-os/validation';
import { Ctx, Public, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { MenuService } from './menu.service';

/** Anonymous, QR-reachable menu surface. */
@ApiTags('public-menu')
@Controller('public/restaurants')
export class PublicMenuController {
  constructor(private readonly menu: MenuService) {}

  @Public()
  @Get(':slug/menu')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Live menu for a restaurant slug, optionally scoped to a table',
  })
  async getMenu(
    @ZodParam('slug', slugSchema) slug: string,
    @Query('table') table?: string,
  ) {
    const tableNumber = table ? Number(table) : undefined;
    const parsedTable =
      tableNumber != null && Number.isInteger(tableNumber) && tableNumber > 0
        ? tableNumber
        : undefined;

    const menu = await this.menu.getPublicMenu(slug, parsedTable);
    // Analytics only - a failure here must not affect the customer.
    void this.menu.recordScan(slug, parsedTable);
    return menu;
  }
}

/** Authenticated menu tree, including hidden and unavailable items. */
@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  @RequirePermissions(Permission.MENU_READ)
  @ApiOperation({ summary: 'Full menu tree for the current branch' })
  getAdminMenu(@Ctx() ctx: RequestContext, @Query('branchId') branchId?: string) {
    return this.menu.getAdminMenu(ctx, branchId);
  }
}
