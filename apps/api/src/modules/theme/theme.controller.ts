import { Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  updateMenuThemeSchema,
  type UpdateMenuThemeInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { ThemeService } from './theme.service';

@ApiTags('menu-theme')
@Controller('menu-theme')
export class ThemeController {
  constructor(private readonly theme: ThemeService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_READ, Permission.BRANDING_MANAGE)
  @ApiOperation({ summary: 'Current menu theme: preset, resolved config, draft state' })
  get(@Ctx() ctx: RequestContext) {
    return this.theme.getForAdmin(ctx);
  }

  @Patch()
  @RequirePermissions(Permission.BRANDING_MANAGE)
  @ApiOperation({ summary: 'Save the theme as a draft, or publish it' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodBody(updateMenuThemeSchema) dto: UpdateMenuThemeInput,
  ) {
    return this.theme.update(ctx, dto);
  }

  @Post('reset')
  @RequirePermissions(Permission.BRANDING_MANAGE)
  @ApiOperation({ summary: 'Discard every customisation and return to the preset' })
  reset(@Ctx() ctx: RequestContext, @Query('publish') publish?: string) {
    return this.theme.reset(ctx, publish === 'true');
  }

  @Post('discard-draft')
  @RequirePermissions(Permission.BRANDING_MANAGE)
  @ApiOperation({ summary: 'Throw away unpublished changes' })
  discard(@Ctx() ctx: RequestContext) {
    return this.theme.discardDraft(ctx);
  }
}
