import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNumberString, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class MomoIpnDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  partnerCode!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  orderId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  requestId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1_000)
  @Max(50_000_000)
  amount!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(1_000)
  orderInfo!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  orderType!: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value,
  )
  @IsNumberString({ no_symbols: true })
  transId!: string;

  @ApiProperty()
  @IsInt()
  resultCode!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(1_000)
  message!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  payType!: string;

  @ApiProperty()
  @IsInt()
  responseTime!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(4_096)
  extraData!: string;

  @ApiProperty({ pattern: '^[0-9a-fA-F]{64}$' })
  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/)
  signature!: string;
}
