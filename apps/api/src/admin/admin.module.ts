import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminAuditController } from './admin-audit.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminHomepageController } from './admin-homepage.controller';
import { AdminProductsController } from './admin-products.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';
import { AdminShopsController } from './admin-shops.controller';
import { AdminUsersController } from './admin-users.controller';

import { ReviewsModule } from '../reviews/reviews.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModerationController } from './admin-moderation.controller';
import { AdminModerationRepository } from './admin-moderation.repository';
import { AdminModerationService } from './admin-moderation.service';
import { AdminReviewsController } from './admin-reviews.controller';

@Module({
  imports: [PrismaModule, AuthModule, ReviewsModule, NotificationsModule],
  controllers: [
    AdminDashboardController,
    AdminUsersController,
    AdminShopsController,
    AdminProductsController,
    AdminCategoriesController,
    AdminHomepageController,
    AdminAuditController,
    AdminModerationController,
    AdminReviewsController,
  ],
  providers: [
    AdminRepository,
    AdminService,
    AdminModerationRepository,
    AdminModerationService,
  ],
  exports: [AdminService, AdminRepository, AdminModerationService, AdminModerationRepository],
})

export class AdminModule {}
