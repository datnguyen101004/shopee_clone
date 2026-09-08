import {
  ADMIN_REVIEW_VISIBILITY_ACTIONS,
  REPORT_REASON_MAX_LENGTH,
  REPORT_REASON_MIN_LENGTH,
  type AdminReviewActionRequest,
  type AdminReviewVisibilityAction,
} from '@shopee-clone/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class AdminReportedReviewPageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
}

export class AdminReviewActionDto implements AdminReviewActionRequest {
  @ApiProperty({ enum: ADMIN_REVIEW_VISIBILITY_ACTIONS, example: 'HIDE' })
  @IsIn(ADMIN_REVIEW_VISIBILITY_ACTIONS)
  action!: AdminReviewVisibilityAction;

  @ApiProperty({
    minLength: REPORT_REASON_MIN_LENGTH,
    maxLength: REPORT_REASON_MAX_LENGTH,
    example: 'Review contains spam links and violates community guidelines.',
  })
  @IsString()
  @MinLength(REPORT_REASON_MIN_LENGTH)
  @MaxLength(REPORT_REASON_MAX_LENGTH)
  reason!: string;

  @ApiProperty({ description: 'Expected review version for optimistic locking' })
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
