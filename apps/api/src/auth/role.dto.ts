import {
  ROLE_REASON_MAX_LENGTH,
  ROLE_REASON_MIN_LENGTH,
  elevatedMarketplaceRoleValues,
} from '@shopee-clone/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class GrantRoleDto {
  @ApiProperty({ enum: elevatedMarketplaceRoleValues })
  @IsIn(elevatedMarketplaceRoleValues)
  role!: 'seller' | 'admin';

  @ApiProperty({ minLength: ROLE_REASON_MIN_LENGTH, maxLength: ROLE_REASON_MAX_LENGTH })
  @IsString()
  @Length(ROLE_REASON_MIN_LENGTH, ROLE_REASON_MAX_LENGTH)
  @Matches(/^\S(?:[\s\S]*\S)?$/)
  reason!: string;
}

export class RevokeRoleDto {
  @ApiProperty({ minLength: ROLE_REASON_MIN_LENGTH, maxLength: ROLE_REASON_MAX_LENGTH })
  @IsString()
  @Length(ROLE_REASON_MIN_LENGTH, ROLE_REASON_MAX_LENGTH)
  @Matches(/^\S(?:[\s\S]*\S)?$/)
  reason!: string;
}

export class RoleAuditQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,512}$/)
  cursor?: string;
}
