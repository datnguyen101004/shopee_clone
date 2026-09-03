import { CHECKOUT_NOTE_MAX_LENGTH } from '@shopee-clone/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { ShopShippingServiceDto, VoucherSelectionDto } from '../pricing/pricing.dto';

export class CheckoutShopNoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shopId!: string;

  @ApiProperty({ maxLength: CHECKOUT_NOTE_MAX_LENGTH, example: 'Giao giờ hành chính' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(CHECKOUT_NOTE_MAX_LENGTH)
  // eslint-disable-next-line no-control-regex -- checkout notes deliberately reject C0/DEL.
  @Matches(/^[^\u0000-\u001f\u007f]*$/)
  note!: string;
}

export class CheckoutPreviewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shippingAddressId!: string;

  @ApiProperty({ type: () => [ShopShippingServiceDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShopShippingServiceDto)
  services!: ShopShippingServiceDto[];

  @ApiPropertyOptional({ type: () => VoucherSelectionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VoucherSelectionDto)
  vouchers?: VoucherSelectionDto;

  @ApiPropertyOptional({ type: () => [CheckoutShopNoteDto], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CheckoutShopNoteDto)
  notes?: CheckoutShopNoteDto[];
}

export class CheckoutConfirmationDto extends CheckoutPreviewDto {
  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  checkoutFingerprint!: string;
}
