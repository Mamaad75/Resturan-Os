import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  finishKitchenRushSchema,
  finishMemoryDuelSchema,
  playGameSchema,
  slugSchema,
  type FinishKitchenRushInput,
  type FinishMemoryDuelInput,
  type PlayGameInput,
} from '@restaurant-os/validation';
import { PUBLIC_ORDER_THROTTLE } from '../../common/throttle';
import { Public } from '../../common/decorators/auth.decorators';
import { ZodBody, ZodParam } from '../../common/decorators/validation.decorators';
import { GamesService } from './games.service';

@ApiTags('public-games')
@Controller('public/restaurants/:slug/game')
export class PublicGamesController {
  constructor(private readonly games: GamesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "A restaurant's game and the caller's standing" })
  state(
    @ZodParam('slug', slugSchema) slug: string,
    @Query('phone') phone?: string,
  ) {
    return this.games.getPublicState(slug, phone?.trim() || undefined);
  }


  @Public()
  @Post('kitchen-rush/start')
  @HttpCode(HttpStatus.OK)
  @Throttle(PUBLIC_ORDER_THROTTLE)
  @ApiOperation({ summary: 'Start Kitchen Rush' })
  startKitchenRush(
    @ZodParam('slug', slugSchema) slug: string,
    @ZodBody(playGameSchema) dto: PlayGameInput,
  ) {
    return this.games.startKitchenRush(slug, dto);
  }

  @Public()
  @Post('kitchen-rush/finish')
  @HttpCode(HttpStatus.OK)
  @Throttle(PUBLIC_ORDER_THROTTLE)
  @ApiOperation({ summary: 'Finish Kitchen Rush' })
  finishKitchenRush(
    @ZodParam('slug', slugSchema) slug: string,
    @Body('phone') phone: string,
    @ZodBody(finishKitchenRushSchema) dto: FinishKitchenRushInput,
  ) {
    if (!phone?.trim()) return this.games.finishKitchenRush(slug, '', dto);
    return this.games.finishKitchenRush(slug, phone.trim(), dto);
  }

  @Public()
  @Get('leaderboard')
  @ApiOperation({
    summary: 'The current season s board',
    description:
      'Public, so nobody appears under their full phone number: a guest is ' +
      'shown by the name they gave, or a masked number.',
  })
  leaderboard(
    @ZodParam('slug', slugSchema) slug: string,
    @Query('phone') phone?: string,
  ) {
    return this.games.leaderboard(slug, phone?.trim() || undefined);
  }

  @Public()
  @Post('memory-duel/start')
  @HttpCode(HttpStatus.OK)
  @Throttle(PUBLIC_ORDER_THROTTLE)
  @ApiOperation({
    summary: 'Deal a Memory Duel board',
    description:
      'Returns the seed the board is dealt from, so the server can reproduce ' +
      'the table the two players saw.',
  })
  startMemoryDuel(
    @ZodParam('slug', slugSchema) slug: string,
    @ZodBody(playGameSchema) dto: PlayGameInput,
  ) {
    return this.games.startMemoryDuel(slug, dto);
  }

  @Public()
  @Post('memory-duel/finish')
  @HttpCode(HttpStatus.OK)
  @Throttle(PUBLIC_ORDER_THROTTLE)
  @ApiOperation({ summary: 'Submit a Memory Duel result and claim the prize' })
  finishMemoryDuel(
    @ZodParam('slug', slugSchema) slug: string,
    @Body('phone') phone: string,
    @ZodBody(finishMemoryDuelSchema) dto: FinishMemoryDuelInput,
  ) {
    return this.games.finishMemoryDuel(slug, phone?.trim() ?? '', dto);
  }

  @Public()
  @Post('play')
  @HttpCode(HttpStatus.OK)
  @Throttle(PUBLIC_ORDER_THROTTLE)
  @ApiOperation({ summary: 'Play the game once' })
  play(
    @ZodParam('slug', slugSchema) slug: string,
    @ZodBody(playGameSchema) dto: PlayGameInput,
  ) {
    return this.games.play(slug, dto);
  }
}
