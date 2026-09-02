import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject } from 'class-validator';

import { CheckoutConfirmationDto } from '../checkout/checkout.dto';

export class OnlinePaymentCheckoutDto extends CheckoutConfirmationDto {
  @ApiProperty({ enum: ['MOMO', 'VNPAY'] })
  @IsIn(['MOMO', 'VNPAY'])
  provider!: 'MOMO' | 'VNPAY';
}

export class PaymentRetryDto {
  @ApiProperty({ enum: ['MOMO', 'VNPAY'] })
  @IsIn(['MOMO', 'VNPAY'])
  provider!: 'MOMO' | 'VNPAY';
}

export class VnpayReturnDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Signed vnp_* fields received by the browser ReturnUrl.',
  })
  @IsObject()
  fields!: Record<string, unknown>;
}
