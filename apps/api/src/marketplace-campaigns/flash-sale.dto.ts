import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FlashSaleRegisterItemDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) salePriceMinor!: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(1_000_000) quota!: number;
}
export class FlashSaleRegisterDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ type: [FlashSaleRegisterItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => FlashSaleRegisterItemDto) items!: FlashSaleRegisterItemDto[];
}
export class FlashSaleQuotaDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(1_000_000) quota!: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}
export class FlashSaleReplenishDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(1_000_000) additionalQuantity!: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}
export class FlashSaleEndDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}
export class FlashSaleStatusQueryDto {
  @ApiPropertyOptional({ type: [String], description: 'Comma-separated variant UUIDs, max 50.' })
  @IsOptional() variantIds?: string | string[];
}
