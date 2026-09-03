import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BuyerProfileRepository } from './buyer-profile.repository';
import { BuyerProfileService } from './buyer-profile.service';
import { RecommendationModelRepository } from './recommendation-model.repository';

@Module({
  imports: [PrismaModule],
  providers: [BuyerProfileRepository, BuyerProfileService, RecommendationModelRepository],
  exports: [BuyerProfileRepository, BuyerProfileService, RecommendationModelRepository],
})
export class RecommendationsModule {}
