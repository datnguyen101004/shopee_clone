import { Module } from '@nestjs/common';

import { CatalogModule } from './catalog/catalog.module';
import { HealthModule } from './health/health.module';
import { HomepageModule } from './homepage/homepage.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, HealthModule, HomepageModule, CatalogModule],
})
export class AppModule {}
