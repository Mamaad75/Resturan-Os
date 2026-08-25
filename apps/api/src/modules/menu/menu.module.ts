import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { MenuController, PublicMenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [
    PublicMenuController,
    MenuController,
    CategoriesController,
    ProductsController,
  ],
  providers: [MenuService, CategoriesService, ProductsService],
  exports: [MenuService, ProductsService],
})
export class MenuModule {}
