import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ExternalRequest } from '../security/external-request.decorator';
import { MomoIpnDto } from './momo-ipn.dto';
import {
  PaymentObservationService,
  ProviderObservationNotFoundError,
} from './payment-observation.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.port';

@ApiTags('payments')
@Controller('payment-providers/momo')
@ExternalRequest('provider-signed-webhook')
export class MomoIpnController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PaymentObservationService)
    private readonly observations: PaymentObservationService,
  ) {}

  @Post('ipn')
  @HttpCode(204)
  @ApiOperation({ summary: 'Receive a signed MoMo sandbox payment notification' })
  @ApiNoContentResponse({ description: 'Notification accepted, including an idempotent replay' })
  async receive(@Body() body: MomoIpnDto): Promise<void> {
    const { signature, ...fields } = body;
    const verified = this.provider.verifyNotification({
      fields,
      signature,
      receivedAt: new Date(),
    });
    if (!verified.valid) throw new BadRequestException('Invalid provider notification');
    try {
      await this.observations.applyProviderObservation({
        source: 'IPN',
        observation: verified.observation,
        fingerprint: verified.fingerprint,
        sanitizedMetadata: verified.sanitizedMetadata,
      });
    } catch (error) {
      // Do not reveal whether an opaque merchant order identifier exists.
      if (error instanceof ProviderObservationNotFoundError) return;
      throw error;
    }
  }
}
