import { Module } from '@nestjs/common';
import {
  GamesAdminController,
  PublicGamesController,
} from './games.controller';
import { GamesService } from './games.service';
@Module({
  controllers: [GamesAdminController, PublicGamesController],
  providers: [GamesService],
})
export class GamesModule {}
