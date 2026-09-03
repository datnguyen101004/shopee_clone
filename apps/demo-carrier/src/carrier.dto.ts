import {
  DEMO_CARRIER_FAILURE_REASONS,
  DEMO_CARRIER_SERVICES,
  type DemoCarrierFailureReason,
  type DemoCarrierServiceCode,
} from '@shopee-clone/contracts';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class LocationCodeDto {
  @IsString()
  @MaxLength(20)
  provinceCode!: string;

  @IsString()
  @MaxLength(20)
  districtCode!: string;
}

export class QuoteRequestDto {
  @IsString()
  @MaxLength(120)
  shipmentReference!: string;

  @ValidateNested()
  @Type(() => LocationCodeDto)
  pickup!: LocationCodeDto;

  @ValidateNested()
  @Type(() => LocationCodeDto)
  delivery!: LocationCodeDto;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  shipmentWeightGrams!: number;

  @IsOptional()
  @IsIn(DEMO_CARRIER_SERVICES)
  service?: DemoCarrierServiceCode;
}

export class RegisterShipmentDto extends QuoteRequestDto {
  @IsString()
  @MaxLength(120)
  trackingCode!: string;
}

export class OperationDto {
  @IsString()
  @IsIn(['ADVANCE', 'FAIL_DELIVERY', 'RETRY_DELIVERY', 'START_RETURN', 'ADVANCE_RETURN', 'RETRY_REGISTRATION'])
  action!: string;

  @IsOptional()
  @IsIn(DEMO_CARRIER_FAILURE_REASONS)
  reason?: DemoCarrierFailureReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ShipmentListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsIn(['REGISTRATION_PENDING', 'REGISTRATION_FAILED', 'CREATED', 'ACCEPTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'RETURN_IN_TRANSIT', 'DELIVERED', 'RETURNED'])
  status?: string;

  @IsOptional()
  @IsIn(DEMO_CARRIER_SERVICES)
  service?: DemoCarrierServiceCode;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => value === undefined ? 50 : Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 50;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}
