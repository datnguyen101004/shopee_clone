import { Module } from '@nestjs/common';

import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { EngagementModule } from './engagement/engagement.module';
import { HealthModule } from './health/health.module';
import { HomepageModule } from './homepage/homepage.module';
import { OrderHistoryModule } from './order-history/order-history.module';
import { PrismaModule } from './prisma/prisma.module';
import { PricingModule } from './pricing/pricing.module';
import { ShopStorefrontModule } from './shop-storefront/shop-storefront.module';
import { BrowserSecurityModule } from './security/browser-security.module';
import { ReviewsModule } from './reviews/reviews.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    HomepageModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    OrderHistoryModule,
    PricingModule,
    AuthModule,
    BrowserSecurityModule,
    AccountModule,
    EngagementModule,
    ShopStorefrontModule,
    ReviewsModule,
  ],
})
export class AppModule {}
