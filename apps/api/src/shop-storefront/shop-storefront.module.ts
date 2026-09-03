import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PublicShopController } from './public-shop.controller';
import { ShopFollowController } from './shop-follow.controller';
import { ShopStorefrontClock } from './shop-storefront-clock';
import { ShopStorefrontExceptionFilter } from './shop-storefront-exception.filter';
import { ShopStorefrontRepository } from './shop-storefront.repository';
import { ShopStorefrontService } from './shop-storefront.service';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [PublicShopController, ShopFollowController],
  providers: [
    ShopStorefrontClock,
    ShopStorefrontExceptionFilter,
    ShopStorefrontRepository,
    ShopStorefrontService,
  ],
})
export class ShopStorefrontModule {}
