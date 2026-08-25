import { Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  updateBrandingSchema,
  updateBranchSchema,
  updateRestaurantSchema,
  updateSettingsSchema,
  uuidSchema,
  type UpdateBrandingInput,
  type UpdateBranchInput,
  type UpdateRestaurantInput,
  type UpdateSettingsInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { RestaurantsService } from './restaurants.service';

@ApiTags('restaurant')
@Controller('restaurant')
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_READ, Permission.MENU_READ)
  @ApiOperation({ summary: 'Current tenant restaurant, branding, settings and branches' })
  get(@Ctx() ctx: RequestContext) {
    return this.restaurants.getForAdmin(ctx);
  }

  @Patch()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update restaurant name, slug or description' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodBody(updateRestaurantSchema) dto: UpdateRestaurantInput,
  ) {
    return this.restaurants.updateRestaurant(ctx, dto);
  }

  @Patch('branding')
  @RequirePermissions(Permission.BRANDING_MANAGE)
  @ApiOperation({ summary: 'Update logo, cover image, colours and theme' })
  updateBranding(
    @Ctx() ctx: RequestContext,
    @ZodBody(updateBrandingSchema) dto: UpdateBrandingInput,
  ) {
    return this.restaurants.updateBranding(ctx, dto);
  }

  @Patch('settings')
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update service modes, tax, service charge and SMS toggles' })
  updateSettings(
    @Ctx() ctx: RequestContext,
    @ZodBody(updateSettingsSchema) dto: UpdateSettingsInput,
  ) {
    return this.restaurants.updateSettings(ctx, dto);
  }

  @Get('branches')
  @RequirePermissions(Permission.SETTINGS_READ, Permission.MENU_READ)
  @ApiOperation({ summary: 'List branches of the current tenant' })
  listBranches(@Ctx() ctx: RequestContext) {
    return this.restaurants.listBranches(ctx);
  }

  @Patch('branches/:id')
  @RequirePermissions(Permission.BRANCH_MANAGE)
  @ApiOperation({ summary: 'Update a branch' })
  updateBranch(
    @Ctx() ctx: RequestContext,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateBranchSchema) dto: UpdateBranchInput,
  ) {
    return this.restaurants.updateBranch(ctx, id, dto);
  }
}
