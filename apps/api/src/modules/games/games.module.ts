import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { PublicGameTrackController } from './public-game-track.controller';
import { PublicGamesController } from './public-games.controller';

/**
 * The restaurant loyalty game. PrismaModule and RestaurantsModule are @Global,
 * so nothing needs importing here; rewards are minted as ordinary coupons
 * directly, which keeps this module free of a dependency on CouponsModule.
 */
@Module({
  controllers: [GamesController, PublicGamesController, PublicGameTrackController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
