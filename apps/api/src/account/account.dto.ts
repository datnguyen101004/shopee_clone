import {
  ACCOUNT_ADDRESS_LABEL_MAX_LENGTH,
  ACCOUNT_ADDRESS_LABEL_MIN_LENGTH,
  ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
  ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
  ACCOUNT_AREA_MAX_LENGTH,
  ACCOUNT_AREA_MIN_LENGTH,
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NAME_MIN_LENGTH,
} from '@shopee-clone/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class UpdateBuyerProfileDto {
  @ApiPropertyOptional({ minLength: ACCOUNT_NAME_MIN_LENGTH, maxLength: ACCOUNT_NAME_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(ACCOUNT_NAME_MIN_LENGTH, ACCOUNT_NAME_MAX_LENGTH)
  displayName?: string;

  @ApiPropertyOptional({ nullable: true, example: '0912345678' })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  phoneNumber?: string | null;
}

export class CreateShippingAddressDto {
  @ApiProperty({ minLength: ACCOUNT_NAME_MIN_LENGTH, maxLength: ACCOUNT_NAME_MAX_LENGTH })
  @IsString()
  @Length(ACCOUNT_NAME_MIN_LENGTH, ACCOUNT_NAME_MAX_LENGTH)
  declare recipientName: string;

  @ApiProperty({ example: '0912345678' })
  @IsString()
  declare phoneNumber: string;

  @ApiProperty({ minLength: ACCOUNT_AREA_MIN_LENGTH, maxLength: ACCOUNT_AREA_MAX_LENGTH })
  @IsString()
  @Length(ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH)
  declare province: string;

  @ApiProperty({ minLength: ACCOUNT_AREA_MIN_LENGTH, maxLength: ACCOUNT_AREA_MAX_LENGTH })
  @IsString()
  @Length(ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH)
  declare district: string;

  @ApiProperty({ minLength: ACCOUNT_AREA_MIN_LENGTH, maxLength: ACCOUNT_AREA_MAX_LENGTH })
  @IsString()
  @Length(ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH)
  declare ward: string;

  @ApiProperty({
    minLength: ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
    maxLength: ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
  })
  @IsString()
  @Length(ACCOUNT_ADDRESS_LINE_MIN_LENGTH, ACCOUNT_ADDRESS_LINE_MAX_LENGTH)
  declare addressLine: string;

  @ApiProperty({
    nullable: true,
    minLength: ACCOUNT_ADDRESS_LABEL_MIN_LENGTH,
    maxLength: ACCOUNT_ADDRESS_LABEL_MAX_LENGTH,
  })
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(ACCOUNT_ADDRESS_LABEL_MIN_LENGTH, ACCOUNT_ADDRESS_LABEL_MAX_LENGTH)
  declare label: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateShippingAddressDto {
  @ApiPropertyOptional({ minLength: ACCOUNT_NAME_MIN_LENGTH, maxLength: ACCOUNT_NAME_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(ACCOUNT_NAME_MIN_LENGTH, ACCOUNT_NAME_MAX_LENGTH)
  recipientName?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ minLength: ACCOUNT_AREA_MIN_LENGTH, maxLength: ACCOUNT_AREA_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH)
  province?: string;

  @ApiPropertyOptional({ minLength: ACCOUNT_AREA_MIN_LENGTH, maxLength: ACCOUNT_AREA_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH)
  district?: string;

  @ApiPropertyOptional({ minLength: ACCOUNT_AREA_MIN_LENGTH, maxLength: ACCOUNT_AREA_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @Length(ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH)
  ward?: string;

  @ApiPropertyOptional({
    minLength: ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
    maxLength: ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @Length(ACCOUNT_ADDRESS_LINE_MIN_LENGTH, ACCOUNT_ADDRESS_LINE_MAX_LENGTH)
  addressLine?: string;

  @ApiPropertyOptional({
    nullable: true,
    minLength: ACCOUNT_ADDRESS_LABEL_MIN_LENGTH,
    maxLength: ACCOUNT_ADDRESS_LABEL_MAX_LENGTH,
  })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @Length(ACCOUNT_ADDRESS_LABEL_MIN_LENGTH, ACCOUNT_ADDRESS_LABEL_MAX_LENGTH)
  label?: string | null;
}
