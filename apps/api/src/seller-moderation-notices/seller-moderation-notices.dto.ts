import {
  SELLER_NOTICES_DEFAULT_LIMIT,
  SELLER_NOTICES_MAX_LIMIT,
  type SellerModerationNoticeListQuery,
} from '@shopee-clone/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SellerModerationNoticesQueryDto implements SellerModerationNoticeListQuery {
  @ApiPropertyOptional({ description: 'Pagination cursor notice ID' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: SELLER_NOTICES_DEFAULT_LIMIT, maximum: SELLER_NOTICES_MAX_LIMIT })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(SELLER_NOTICES_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter unread notices only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreadOnly?: boolean;
}
