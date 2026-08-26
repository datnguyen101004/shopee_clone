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
import { SellerOnboardingModule } from './seller-onboarding/seller-onboarding.module';
import { SellerProductsModule } from './seller-products/seller-products.module';
import { InventoryModule } from './inventory/inventory.module';
import { ProductRetentionModule } from './product-retention/product-retention.module';
import { SellerOrdersModule } from './seller-orders/seller-orders.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SellerAnalyticsModule } from './seller-analytics/seller-analytics.module';
import { SellerPromotionsModule } from './seller-promotions/seller-promotions.module';
import { AdminModule } from './admin/admin.module';
import { ReportingModule } from './reporting/reporting.module';
import { SellerModerationNoticesModule } from './seller-moderation-notices/seller-moderation-notices.module';
import { ReturnsModule } from './returns/returns.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SellerIdentityModule } from './seller-identity/seller-identity.module';

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
    SellerOnboardingModule,
    SellerProductsModule,
    InventoryModule,
    ScheduleModule.forRoot(),
    ProductRetentionModule,
    ReviewsModule,
    SellerOrdersModule,
    SellerAnalyticsModule,
    SellerPromotionsModule,
    AdminModule,
    ReportingModule,
    SellerModerationNoticesModule,
    ReturnsModule,
    NotificationsModule,
    SellerIdentityModule,
  ],
})
export class AppModule {}

