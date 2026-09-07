import { Controller, Get, Header, Headers, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  Permission,
  type GameKind,
  type GameRules,
} from '@restaurant-os/types';
import {
  gameMoveSchema,
  gameRewardSchema,
  gameRulesSchema,
  gameStartSchema,
  uuidSchema,
} from '@restaurant-os/validation';
import { z } from 'zod';
import {
  Ctx,
  Public,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import {
  ZodBody,
  ZodParam,
} from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { GamesService } from './games.service';
const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/);

@Controller('public/orders/track/:token/games')
@Public()
@Throttle({ default: { limit: 90, ttl: 60000 } })
export class PublicGamesController {
  constructor(private readonly games: GamesService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  profile(
    @Headers('x-game-key') playerKey: string,
    @ZodParam('token', tokenSchema) token: string,
  ) {
    return this.games.profile(token, playerKey);
  }
  @Post()
  start(
    @Headers('x-game-key') playerKey: string,
    @ZodParam('token', tokenSchema) token: string,
    @ZodBody(gameStartSchema) dto: { kind: GameKind },
  ) {
    return this.games.start(token, dto.kind, playerKey);
  }
  @Post(':id/moves')
  move(
    @Headers('x-game-key') playerKey: string,
    @ZodParam('token', tokenSchema) token: string,
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(gameMoveSchema) dto: { revision: number; value: number },
  ) {
    return this.games.move(token, id, dto, playerKey);
  }
  @Post('reward')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  reward(
    @Headers('x-game-key') playerKey: string,
    @ZodParam('token', tokenSchema) token: string,
    @ZodBody(gameRewardSchema) dto: { requestId: string },
  ) {
    return this.games.reward(token, dto.requestId, playerKey);
  }
}

@Controller('games/program')
export class GamesAdminController {
  constructor(private readonly games: GamesService) {}
  @Get()
  @RequirePermissions(Permission.SETTINGS_READ)
  get(@Ctx() ctx: RequestContext) {
    return this.games.rules(ctx.tenantId);
  }
  @Put()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  save(@Ctx() ctx: RequestContext, @ZodBody(gameRulesSchema) dto: GameRules) {
    return this.games.save(ctx, dto);
  }
}
