import { Module } from '@nestjs/common';

import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CartModule } from './cart/cart.module';
import { EngagementModule } from './engagement/engagement.module';
import { HealthModule } from './health/health.module';
import { HomepageModule } from './homepage/homepage.module';
import { PrismaModule } from './prisma/prisma.module';
import { ShopStorefrontModule } from './shop-storefront/shop-storefront.module';
import { BrowserSecurityModule } from './security/browser-security.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    HomepageModule,
    CatalogModule,
    CartModule,
    AuthModule,
    BrowserSecurityModule,
    AccountModule,
    EngagementModule,
    ShopStorefrontModule,
  ],
})
export class AppModule {}
