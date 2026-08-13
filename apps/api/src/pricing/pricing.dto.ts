import { SHIPPING_SERVICES } from '@shopee-clone/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsUUID, ValidateNested } from 'class-validator';

export class ShopShippingServiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shopId!: string;

  @ApiProperty({ enum: SHIPPING_SERVICES })
  @IsIn(SHIPPING_SERVICES)
  service!: 'ECONOMY' | 'STANDARD' | 'EXPRESS';
}

export class PricingQuoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shippingAddressId!: string;

  @ApiPropertyOptional({ type: () => [ShopShippingServiceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShopShippingServiceDto)
  services?: ShopShippingServiceDto[];
}
