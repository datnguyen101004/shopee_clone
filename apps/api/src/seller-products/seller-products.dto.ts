import {
  SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH,
  SELLER_PRODUCT_MAX_MEDIA,
  SELLER_PRODUCT_TITLE_MAX_LENGTH,
} from '@shopee-clone/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Length, Matches, Max, Min, ValidateIf, ValidateNested } from 'class-validator';

export class SellerProductAttributeDto {
  @ApiProperty() @IsString() definitionId!: string;
  @ApiProperty() @IsString() @Length(1, 240) value!: string;
}
export class SellerProductMediaDto {
  @ApiProperty({ required: false }) @ValidateIf((_object, value: unknown) => value !== undefined) @IsUrl({ protocols: ['https'], require_protocol: true }) url?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() assetId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() imageId?: string;
  @ApiProperty({ nullable: true }) @ValidateIf((_object, value: unknown) => value !== null) @IsString() @Length(0, 240) altText!: string | null;
  @ApiProperty() @IsInt() @Min(0) @Max(SELLER_PRODUCT_MAX_MEDIA) sortOrder!: number;
}

export class SellerProductMediaUploadIntentDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] }) @IsIn(['image/jpeg', 'image/png', 'image/webp']) mimeType!: 'image/jpeg' | 'image/png' | 'image/webp';
  @ApiProperty({ minimum: 1, maximum: 5 * 1024 * 1024 }) @IsInt() @Min(1) @Max(5 * 1024 * 1024) byteSize!: number;
  @ApiProperty({ description: 'Base64 SHA-256 digest of the complete image bytes' }) @IsString() @Matches(/^[A-Za-z0-9+/]{43}=$/) checksumSha256!: string;
}

export class SellerProductMediaCompleteDto {}
export class SellerProductOptionValueMediaRefDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() assetId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() imageId?: string;
}
export class SellerProductOptionValueMediaDto {
  @ApiProperty() @IsInt() @Min(0) groupIndex!: number;
  @ApiProperty() @IsString() @Length(1, 120) value!: string;
  @ApiProperty({ type: SellerProductOptionValueMediaRefDto, nullable: true }) @ValidateIf((_object, value: unknown) => value !== null) @ValidateNested() @Type(() => SellerProductOptionValueMediaRefDto) mediaRef!: SellerProductOptionValueMediaRefDto | null;
}
export class SellerProductOptionDto {
  @ApiProperty() @IsString() @Length(1, 80) name!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) values!: string[];
}
export class SellerProductVariantDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) combination!: string[];
  @ApiProperty() @IsInt() @Min(0) priceMinor!: number;
  @ApiProperty({ nullable: true }) @ValidateIf((_object, value: unknown) => value !== null) @IsInt() @Min(0) compareAtPriceMinor!: number | null;
  @ApiProperty() @IsInt() @Min(0) stock!: number;
  @ApiProperty() @IsInt() @Min(1) weightGrams!: number;
  @ApiProperty({ nullable: true }) @ValidateIf((_object, value: unknown) => value !== null) @IsInt() @Min(1) maxPurchaseQuantity!: number | null;
  @ApiProperty() @IsBoolean() active!: boolean;
}
export class SellerProductUpsertDto {
  @ApiProperty() @IsString() @Length(1, SELLER_PRODUCT_TITLE_MAX_LENGTH) name!: string;
  @ApiProperty() @IsString() @Length(0, SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH) description!: string;
  @ApiProperty() @IsString() categoryId!: string;
  @ApiProperty({ type: [SellerProductAttributeDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => SellerProductAttributeDto) attributes!: SellerProductAttributeDto[];
  @ApiProperty({ type: [SellerProductMediaDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => SellerProductMediaDto) media!: SellerProductMediaDto[];
  @ApiProperty({ type: [SellerProductOptionValueMediaDto], required: false }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SellerProductOptionValueMediaDto) optionValueMedia?: SellerProductOptionValueMediaDto[];
  @ApiProperty({ nullable: true }) @ValidateIf((_object, value: unknown) => value !== null) @IsInt() @Min(1) packageLengthMm!: number | null;
  @ApiProperty({ nullable: true }) @ValidateIf((_object, value: unknown) => value !== null) @IsInt() @Min(1) packageWidthMm!: number | null;
  @ApiProperty({ nullable: true }) @ValidateIf((_object, value: unknown) => value !== null) @IsInt() @Min(1) packageHeightMm!: number | null;
  @ApiProperty({ type: [SellerProductOptionDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => SellerProductOptionDto) optionGroups!: SellerProductOptionDto[];
  @ApiProperty({ type: [SellerProductVariantDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => SellerProductVariantDto) variants!: SellerProductVariantDto[];
}
export class SellerProductLifecycleDto {
  @ApiProperty({ enum: ['published', 'hidden', 'archived'] }) @IsIn(['published', 'hidden', 'archived']) lifecycle!: 'published' | 'hidden' | 'archived';
}
