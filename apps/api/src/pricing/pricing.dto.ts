import { SHIPPING_SERVICES, normalizeVoucherCode } from '@shopee-clone/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

const canonicalizeCode = ({ value }: { value: unknown }) => normalizeVoucherCode(value) ?? value;
const voucherCodePattern = /^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/;

export class ShopShippingServiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shopId!: string;

  @ApiProperty({ enum: SHIPPING_SERVICES })
  @IsIn(SHIPPING_SERVICES)
  service!: 'ECONOMY' | 'STANDARD' | 'EXPRESS';
}

export class ShopVoucherCodeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shopId!: string;

  @ApiProperty({ example: 'SHOP-15', minLength: 4, maxLength: 32 })
  @Transform(canonicalizeCode)
  @IsString()
  @Matches(voucherCodePattern)
  code!: string;
}

export class VoucherSelectionDto {
  @ApiPropertyOptional({ example: 'PLATFORM-10', minLength: 4, maxLength: 32 })
  @IsOptional()
  @Transform(canonicalizeCode)
  @IsString()
  @Matches(voucherCodePattern)
  platformCode?: string;

  @ApiPropertyOptional({ type: () => [ShopVoucherCodeDto], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShopVoucherCodeDto)
  shopCodes?: ShopVoucherCodeDto[];

  @ApiPropertyOptional({ example: 'FREESHIP-30K', minLength: 4, maxLength: 32 })
  @IsOptional()
  @Transform(canonicalizeCode)
  @IsString()
  @Matches(voucherCodePattern)
  freeShippingCode?: string;
}

export class PricingQuoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shippingAddressId!: string;

  @ApiPropertyOptional({ type: () => [ShopShippingServiceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShopShippingServiceDto)
  services?: ShopShippingServiceDto[];

  @ApiPropertyOptional({ type: () => VoucherSelectionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VoucherSelectionDto)
  vouchers?: VoucherSelectionDto;
}
