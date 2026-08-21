import {
  ADMIN_REVIEW_VISIBILITY_ACTIONS,
  REPORT_REASON_MAX_LENGTH,
  REPORT_REASON_MIN_LENGTH,
  type AdminReviewActionRequest,
  type AdminReviewVisibilityAction,
} from '@shopee-clone/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

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
