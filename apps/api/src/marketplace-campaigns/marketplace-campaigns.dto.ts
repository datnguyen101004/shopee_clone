import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class CampaignContentBlockDto {
  @ApiProperty({ enum: ['heading', 'paragraph', 'list', 'link'] }) @IsIn(['heading', 'paragraph', 'list', 'link']) kind!: 'heading' | 'paragraph' | 'list' | 'link';
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsIn([2, 3]) level?: 2 | 3;
  @ApiPropertyOptional() @IsOptional() @IsString() text?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) items?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() href?: string;
}

export class CreateCampaignDto {
  @ApiProperty() @IsString() typeCode!: string;
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eyebrow?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiProperty({ type: [CampaignContentBlockDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => CampaignContentBlockDto) content!: CampaignContentBlockDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string | null;
  @ApiProperty() @IsString() altText!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() theme?: string;
  @ApiProperty() @IsISO8601() announceAt!: string;
  @ApiProperty() @IsISO8601() enrollmentStartsAt!: string;
  @ApiProperty() @IsISO8601() enrollmentEndsAt!: string;
  @ApiProperty() @IsISO8601() startsAt!: string;
  @ApiProperty() @IsISO8601() endsAt!: string;
  @ApiProperty({ minimum: 1, maximum: 9000 }) @IsInt() @Min(1) @Max(9000) minimumDiscountBasisPoints!: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) categoryIds?: string[];
}

export class UpdateCampaignDto extends CreateCampaignDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}

export class CampaignPreviewDto extends CreateCampaignDto {}

export class CampaignCancelDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty() @IsString() reason!: string;
}

export class CampaignPublishDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}

export class CampaignParticipationProductDto {
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty({ minimum: 1, maximum: 9000 }) @IsInt() @Min(1) @Max(9000) discountBasisPoints!: number;
}

export class CampaignParticipationDto {
  @ApiProperty({ enum: ['JOINED', 'DECLINED'] }) @IsIn(['JOINED', 'DECLINED']) decision!: 'JOINED' | 'DECLINED';
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Min(1) version!: number | null;
  @ApiPropertyOptional({ type: [CampaignParticipationProductDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CampaignParticipationProductDto) products?: CampaignParticipationProductDto[];
}

export class CampaignCursorQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @ApiPropertyOptional() @IsOptional() @IsString() typeCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['AVAILABLE', 'JOINED', 'UPCOMING', 'ACTIVE', 'ENDED', 'DRAFT', 'ANNOUNCED', 'ENROLLMENT_OPEN', 'SCHEDULED', 'CANCELLED']) state?: 'AVAILABLE' | 'JOINED' | 'UPCOMING' | 'ACTIVE' | 'ENDED' | 'DRAFT' | 'ANNOUNCED' | 'ENROLLMENT_OPEN' | 'SCHEDULED' | 'CANCELLED';
}

export class SellerCampaignPageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional() @IsOptional() @IsString() typeCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['AVAILABLE', 'JOINED', 'UPCOMING', 'ACTIVE', 'ENDED']) state?: 'AVAILABLE' | 'JOINED' | 'UPCOMING' | 'ACTIVE' | 'ENDED';
}

export class AdminCampaignPageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional() @IsOptional() @IsString() typeCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['UPCOMING', 'ACTIVE', 'ENDED', 'DRAFT', 'ANNOUNCED', 'ENROLLMENT_OPEN', 'SCHEDULED', 'CANCELLED']) state?: 'UPCOMING' | 'ACTIVE' | 'ENDED' | 'DRAFT' | 'ANNOUNCED' | 'ENROLLMENT_OPEN' | 'SCHEDULED' | 'CANCELLED';
}

export class AdminCampaignParticipantPageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
}

export class CampaignPlacementDto {
  @ApiProperty() @IsUUID() moduleId!: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() enabled?: boolean;
}
