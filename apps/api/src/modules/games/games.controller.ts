import { Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import {
  updateGameConfigSchema,
  type UpdateGameConfigInput,
} from '@restaurant-os/validation';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodBody } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { GamesService } from './games.service';

@ApiTags('games')
@Controller('game')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: "The restaurant's loyalty game configuration" })
  get(@Ctx() ctx: RequestContext) {
    return this.games.getConfig(ctx);
  }

  @Put()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Enable/disable and configure the game' })
  update(
    @Ctx() ctx: RequestContext,
    @ZodBody(updateGameConfigSchema) dto: UpdateGameConfigInput,
  ) {
    return this.games.updateConfig(ctx, dto);
  }

  @Get('plays')
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'Recent plays (activity feed)' })
  plays(@Ctx() ctx: RequestContext) {
    return this.games.recentPlays(ctx);
  }
}
