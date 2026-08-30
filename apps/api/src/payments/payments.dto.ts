import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

import { CheckoutConfirmationDto } from '../checkout/checkout.dto';

export class OnlinePaymentCheckoutDto extends CheckoutConfirmationDto {
  @ApiProperty({ enum: ['MOMO'] })
  @Equals('MOMO')
  provider!: 'MOMO';
}
