import {
  ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
  ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
  ACCOUNT_AREA_MAX_LENGTH,
  ACCOUNT_AREA_MIN_LENGTH,
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NAME_MIN_LENGTH,
  ROLE_REASON_MAX_LENGTH,
  ROLE_REASON_MIN_LENGTH,
  SELLER_SHOP_SLUG_MAX_LENGTH,
  SHOP_DESCRIPTION_MAX_LENGTH,
  SHOP_LOCATION_MAX_LENGTH,
  SHOP_LOCATION_MIN_LENGTH,
  SHOP_MEDIA_URL_MAX_LENGTH,
  SHOP_NAME_MAX_LENGTH,
  SHOP_NAME_MIN_LENGTH,
  SHOP_SLUG_MIN_LENGTH,
} from '@shopee-clone/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ShopServiceAddressDto {
  @ApiProperty()
  @IsString()
  @Length(ACCOUNT_NAME_MIN_LENGTH, ACCOUNT_NAME_MAX_LENGTH)
  declare recipientName: string;

  @ApiProperty()
  @IsString()
  declare phoneNumber: string;

  @ApiProperty()
  @IsString()
  @Length(ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH)
  declare province: string;

  @ApiProperty()
  @IsString()
  @Length(ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH)
  declare district: string;

  @ApiProperty()
  @IsString()
  @Length(ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH)
  declare ward: string;

  @ApiProperty()
  @IsString()
  @Length(ACCOUNT_ADDRESS_LINE_MIN_LENGTH, ACCOUNT_ADDRESS_LINE_MAX_LENGTH)
  declare addressLine: string;
}

export class CreateSellerShopDto {
  @ApiProperty()
  @IsString()
  @Length(SHOP_SLUG_MIN_LENGTH, SELLER_SHOP_SLUG_MAX_LENGTH)
  declare slug: string;

  @ApiProperty()
  @IsString()
  @Length(SHOP_NAME_MIN_LENGTH, SHOP_NAME_MAX_LENGTH)
  declare name: string;

  @ApiProperty()
  @IsString()
  @Length(0, SHOP_DESCRIPTION_MAX_LENGTH)
  declare description: string;

  @ApiProperty({ nullable: true })
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(8, SHOP_MEDIA_URL_MAX_LENGTH)
  declare logoUrl: string | null;

  @ApiProperty({ nullable: true })
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(8, SHOP_MEDIA_URL_MAX_LENGTH)
  declare bannerUrl: string | null;

  @ApiProperty()
  @IsString()
  @Length(SHOP_LOCATION_MIN_LENGTH, SHOP_LOCATION_MAX_LENGTH)
  declare location: string;

  @ApiProperty()
  @IsString()
  declare contactPhone: string;

  @ApiProperty()
  @IsEmail()
  declare contactEmail: string;

  @ApiProperty({ type: ShopServiceAddressDto })
  @ValidateNested()
  @Type(() => ShopServiceAddressDto)
  declare pickupAddress: ShopServiceAddressDto;

  @ApiProperty({ type: ShopServiceAddressDto })
  @ValidateNested()
  @Type(() => ShopServiceAddressDto)
  declare returnAddress: ShopServiceAddressDto;
}

export class UpdateSellerShopDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(SHOP_SLUG_MIN_LENGTH, SELLER_SHOP_SLUG_MAX_LENGTH)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(SHOP_NAME_MIN_LENGTH, SHOP_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, SHOP_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(8, SHOP_MEDIA_URL_MAX_LENGTH)
  logoUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(8, SHOP_MEDIA_URL_MAX_LENGTH)
  bannerUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(SHOP_LOCATION_MIN_LENGTH, SHOP_LOCATION_MAX_LENGTH)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ type: ShopServiceAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShopServiceAddressDto)
  pickupAddress?: ShopServiceAddressDto;

  @ApiPropertyOptional({ type: ShopServiceAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShopServiceAddressDto)
  returnAddress?: ShopServiceAddressDto;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class ShopApprovalDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  declare decision: 'approve' | 'reject';

  @ApiProperty()
  @IsString()
  @Length(ROLE_REASON_MIN_LENGTH, ROLE_REASON_MAX_LENGTH)
  declare reason: string;
}

