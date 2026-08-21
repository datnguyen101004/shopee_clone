import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_DETAILS_MIN_LENGTH,
  REPORT_MAX_EVIDENCE_URLS,
  MODERATION_MAX_LIMIT,
  REPORT_REASON_CODES,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  type CreateReportRequest,
  type ReportReasonCode,
  type ReportStatus,
  type ReportTargetType,
  type ReporterReportListQuery,
} from '@shopee-clone/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReportDto implements CreateReportRequest {
  @ApiProperty({ enum: REPORT_TARGET_TYPES, example: 'PRODUCT' })
  @IsIn(REPORT_TARGET_TYPES)
  targetType!: ReportTargetType;

  @ApiProperty({ format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ enum: REPORT_REASON_CODES, example: 'PROHIBITED_ITEM' })
  @IsIn(REPORT_REASON_CODES)
  reasonCode!: ReportReasonCode;

  @ApiProperty({
    minLength: REPORT_DETAILS_MIN_LENGTH,
    maxLength: REPORT_DETAILS_MAX_LENGTH,
    example: 'This product violates policies regarding prohibited items.',
  })
  @IsString()
  @MinLength(REPORT_DETAILS_MIN_LENGTH)
  @MaxLength(REPORT_DETAILS_MAX_LENGTH)
  details!: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: REPORT_MAX_EVIDENCE_URLS,
    example: ['https://cdn.example.com/proof1.jpg'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REPORT_MAX_EVIDENCE_URLS)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  evidenceUrls?: string[];
}

export class ReporterReportQueryDto implements ReporterReportListQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: MODERATION_MAX_LIMIT, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MODERATION_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Pagination cursor (report id)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: REPORT_TARGET_TYPES })
  @IsOptional()
  @IsIn(REPORT_TARGET_TYPES)
  targetType?: ReportTargetType;

  @ApiPropertyOptional({ enum: REPORT_STATUSES })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status?: ReportStatus;
}
