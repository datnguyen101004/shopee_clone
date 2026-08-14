import {
  ORDER_CANCELLATION_NOTE_MAX_LENGTH,
  ORDER_CANCELLATION_REASON_CODES,
} from '@shopee-clone/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @ApiProperty({ enum: ORDER_CANCELLATION_REASON_CODES })
  @IsString()
  @IsIn(ORDER_CANCELLATION_REASON_CODES)
  declare reasonCode: string;

  @ApiPropertyOptional({ maxLength: ORDER_CANCELLATION_NOTE_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(ORDER_CANCELLATION_NOTE_MAX_LENGTH)
  reasonNote?: string;
}
