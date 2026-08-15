import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ReviewMediaStorage } from './review-media.storage';
import { ReviewsController } from './reviews.controller';
import { ReviewsExceptionFilter } from './reviews-exception.filter';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [AuthModule],
  controllers: [ReviewsController],
  providers: [ReviewMediaStorage, ReviewsExceptionFilter, ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
