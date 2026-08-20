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

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    AdminDashboardController,
    AdminUsersController,
    AdminShopsController,
    AdminProductsController,
    AdminCategoriesController,
    AdminHomepageController,
    AdminAuditController,
  ],
  providers: [AdminRepository, AdminService],
  exports: [AdminService, AdminRepository],
})

export class AdminModule {}
