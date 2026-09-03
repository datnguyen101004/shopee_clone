import {
  ADMIN_RETURN_DECISIONS,
  BUYER_RETURN_ACTIONS,
  RETURN_DESCRIPTION_MIN_LENGTH,
  RETURN_DESCRIPTION_MAX_LENGTH,
  RETURN_EVIDENCE_MAX_ITEMS,
  RETURN_EVIDENCE_MIN_ITEMS,
  RETURN_REASON_CODES,
  RETURN_STATUSES,
  SELLER_RETURN_ACTIONS,
} from '@shopee-clone/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ReturnItemDto {
  @IsUUID() lineReference!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}
export class CreateReturnDto {
  @IsIn(RETURN_REASON_CODES) reasonCode!: string;
  @IsString()
  @MinLength(RETURN_DESCRIPTION_MIN_LENGTH)
  @MaxLength(RETURN_DESCRIPTION_MAX_LENGTH)
  description!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
  @IsArray()
  @ArrayMinSize(RETURN_EVIDENCE_MIN_ITEMS)
  @ArrayMaxSize(RETURN_EVIDENCE_MAX_ITEMS)
  @IsUUID('4', { each: true })
  evidenceIds!: string[];
}
export class BuyerReturnActionDto {
  @IsIn(BUYER_RETURN_ACTIONS) action!: string;
}
export class SellerReturnActionDto {
  @IsIn(SELLER_RETURN_ACTIONS) action!: string;
  @IsOptional() @IsString() @MaxLength(500) publicReason?: string;
}
export class AdminReturnDecisionDto {
  @IsIn(ADMIN_RETURN_DECISIONS) decision!: string;
  @IsString() @MinLength(8) @MaxLength(500) publicReason!: string;
  @IsOptional() @IsString() @MaxLength(1000) internalNote?: string;
}
export class ReturnListQueryDto {
  @IsOptional() @IsIn(['ALL', ...RETURN_STATUSES]) status?: string;
  @IsOptional() @IsIn(['ALL', 'OVERDUE', 'DUE_SOON']) deadline?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsUUID() reference?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() cursor?: string;
}
