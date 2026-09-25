import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { finishKitchenRushSchema, type FinishKitchenRushInput } from '@restaurant-os/validation';
import { PUBLIC_ORDER_THROTTLE } from '../../common/throttle';
import { Public } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import { GamesService } from './games.service';

const trackingTokenSchema = z
  .string()
  .regex(/^[a-f0-9]{48}$/, 'لینک پیگیری معتبر نیست.');

/** The game, reached from an order's tracking page — the player is the order's phone. */
@ApiTags('public-games')
@Controller('public/orders/track/:token/game')
export class PublicGameTrackController {
  constructor(private readonly games: GamesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Game state for this order (player = the order phone)' })
  state(@ZodParam('token', trackingTokenSchema) token: string) {
    return this.games.getStateByToken(token);
  }


  @Public()
  @Post('kitchen-rush/start')
  @HttpCode(HttpStatus.OK)
  @Throttle(PUBLIC_ORDER_THROTTLE)
  @ApiOperation({ summary: 'Start a server-owned Kitchen Rush session' })
  startKitchenRush(@ZodParam('token', trackingTokenSchema) token: string) {
    return this.games.startKitchenRushByToken(token);
  }

  @Public()
  @Post('kitchen-rush/finish')
  @HttpCode(HttpStatus.OK)
  @Throttle(PUBLIC_ORDER_THROTTLE)
  @ApiOperation({ summary: 'Finish and validate a Kitchen Rush session' })
  finishKitchenRush(
    @ZodParam('token', trackingTokenSchema) token: string,
    @ZodBody(finishKitchenRushSchema) dto: FinishKitchenRushInput,
  ) {
    return this.games.finishKitchenRushByToken(token, dto);
  }

  @Public()
  @Post('play')
  @HttpCode(HttpStatus.OK)
  @Throttle(PUBLIC_ORDER_THROTTLE)
  @ApiOperation({ summary: 'Play once from the tracking page' })
  play(
    @ZodParam('token', trackingTokenSchema) token: string,
    @Body('phone') phone?: string,
    @Body('name') name?: string,
  ) {
    return this.games.playByToken(token, phone?.trim() || undefined, name ?? null);
  }
}
