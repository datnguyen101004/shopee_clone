import {
  MODERATION_CASE_OUTCOMES,
  MODERATION_CASE_STATUSES,
  MODERATION_MAX_LIMIT,
  MODERATION_PRIVATE_NOTE_MAX_LENGTH,
  REPORT_REASON_CODES,
  REPORT_REASON_MAX_LENGTH,
  REPORT_REASON_MIN_LENGTH,
  REPORT_TARGET_TYPES,
  type AddModerationCaseNoteRequest,
  type AssignModerationCaseRequest,
  type CreateModerationDecisionRequest,
  type ModerationCaseListQuery,
  type ModerationCaseOutcome,
  type ModerationCaseStatus,
  type ReportReasonCode,
  type ReportTargetType,
} from '@shopee-clone/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ModerationCaseQueryDto implements ModerationCaseListQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: MODERATION_MAX_LIMIT, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MODERATION_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Pagination cursor (case id)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: MODERATION_CASE_STATUSES })
  @IsOptional()
  @IsIn(MODERATION_CASE_STATUSES)
  status?: ModerationCaseStatus;

  @ApiPropertyOptional({ enum: REPORT_TARGET_TYPES })
  @IsOptional()
  @IsIn(REPORT_TARGET_TYPES)
  targetType?: ReportTargetType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Exact product or shop target ID' })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Exact moderation case, product, or shop identifier' })
  @IsOptional()
  @IsUUID()
  searchId?: string;

  @ApiPropertyOptional({ enum: REPORT_REASON_CODES })
  @IsOptional()
  @IsIn(REPORT_REASON_CODES)
  reasonCode?: ReportReasonCode;

  @ApiPropertyOptional({ format: 'uuid', description: 'Assigned admin user ID' })
  @IsOptional()
  @IsUUID()
  assignedAdminId?: string;
}

export class AssignModerationCaseDto implements AssignModerationCaseRequest {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Admin user ID to assign, or null to unassign' })
  @ValidateIf((_obj, val) => val !== null && val !== undefined)
  @IsUUID()
  assignedAdminId!: string | null;

  @ApiProperty({ description: 'Expected case version for optimistic locking' })
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class AddModerationCaseNoteDto implements AddModerationCaseNoteRequest {
  @ApiProperty({
    minLength: 1,
    maxLength: MODERATION_PRIVATE_NOTE_MAX_LENGTH,
    example: 'Investigated product listing. Seller provided certificate.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MODERATION_PRIVATE_NOTE_MAX_LENGTH)
  note!: string;

  @ApiProperty({ description: 'Expected case version for optimistic locking' })
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class CreateModerationDecisionDto implements CreateModerationDecisionRequest {
  @ApiProperty({ enum: MODERATION_CASE_OUTCOMES, example: 'SUSPEND_TARGET' })
  @IsIn(MODERATION_CASE_OUTCOMES)
  outcome!: ModerationCaseOutcome;

  @ApiProperty({
    minLength: REPORT_REASON_MIN_LENGTH,
    maxLength: REPORT_REASON_MAX_LENGTH,
    example: 'Product suspended due to confirmed counterfeit items.',
  })
  @IsString()
  @MinLength(REPORT_REASON_MIN_LENGTH)
  @MaxLength(REPORT_REASON_MAX_LENGTH)
  publicReason!: string;

  @ApiPropertyOptional({
    maxLength: MODERATION_PRIVATE_NOTE_MAX_LENGTH,
    example: 'Internal investigation findings: multiple buyer reports verified.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MODERATION_PRIVATE_NOTE_MAX_LENGTH)
  privateNote?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Decision ID to reverse, if applicable' })
  @IsOptional()
  @IsUUID()
  reversesDecisionId?: string;

  @ApiProperty({ description: 'Expected case version for optimistic locking' })
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
