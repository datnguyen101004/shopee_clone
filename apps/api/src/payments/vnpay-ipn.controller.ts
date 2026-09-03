import { Controller, Get, HttpCode, Inject, Optional, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { ExternalRequest } from '../security/external-request.decorator';
import { VNPAY_CONFIG, type VnpayConfig } from './vnpay.config';
import { VNPAY_PROVIDER, type PaymentProvider } from './payment-provider.port';
import {
  PaymentObservationService,
  ProviderObservationNotFoundError,
} from './payment-observation.service';

function protocolResponse(code: string, message: string): { RspCode: string; Message: string } {
  return { RspCode: code, Message: message };
}

@ApiTags('payments')
@Controller(['payment-providers/vnpay', 'callback'])
@ExternalRequest('provider-signed-webhook')
export class VnpayIpnController {
  constructor(
    @Inject(VNPAY_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PaymentObservationService) private readonly observations: PaymentObservationService,
    @Optional() @Inject(VNPAY_CONFIG) private readonly config?: VnpayConfig,
  ) {}

  @Get('ipn')
  @HttpCode(200)
  @ApiQuery({ name: 'vnp_TxnRef', required: true })
  @ApiQuery({ name: 'vnp_SecureHash', required: true })
  @ApiOperation({ summary: 'Receive a signed VNPAY sandbox IPN notification' })
  async receive(
    @Query() query: Record<string, unknown>,
  ): Promise<{ RspCode: string; Message: string }> {
    return this.process(query);
  }

  @Get('payment-callback')
  @HttpCode(200)
  async receiveLegacy(
    @Query() query: Record<string, unknown>,
  ): Promise<{ RspCode: string; Message: string }> {
    return this.process(query);
  }

  private async process(
    query: Record<string, unknown>,
  ): Promise<{ RspCode: string; Message: string }> {
    // A disabled installation must not accept the deterministic fake adapter
    // used by local tests as if it were a real VNPAY signature verifier.
    // Existing production attempts should be handled only after operators
    // re-enable the provider with the merchant credentials available.
    if (this.config && !this.config.enabled) return protocolResponse('99', 'Invalid request');
    const signature = typeof query.vnp_SecureHash === 'string' ? query.vnp_SecureHash : '';
    const fields: Record<string, string | number | null> = {};
    const entries = Object.entries(query);
    if (entries.length > 64) return protocolResponse('99', 'Invalid request');
    for (const [key, value] of entries) {
      if (
        !/^vnp_[A-Za-z0-9_]{1,64}$/.test(key) ||
        Array.isArray(value) ||
        typeof value !== 'string' ||
        value.length > 512
      )
        return protocolResponse('99', 'Invalid request');
      fields[key] = value;
    }
    const verified = this.provider.verifyNotification({
      fields,
      signature,
      receivedAt: new Date(),
    });
    if (!verified.valid) {
      return protocolResponse(
        verified.reason === 'INVALID_SIGNATURE'
          ? '97'
          : verified.reason === 'INVALID_AMOUNT'
            ? '04'
            : '99',
        verified.reason === 'INVALID_AMOUNT' ? 'Invalid amount' : 'Invalid request',
      );
    }
    try {
      const result = await this.observations.applyProviderObservation({
        source: 'IPN',
        observation: verified.observation,
        fingerprint: verified.fingerprint,
        sanitizedMetadata: verified.sanitizedMetadata,
      });
      if (result.decision === 'MISMATCH') return protocolResponse('04', 'Invalid amount');
      if (
        result.decision === 'DUPLICATE' ||
        (result.decision === 'IGNORED' && result.status === 'PAID')
      ) {
        return protocolResponse('02', 'Already confirmed');
      }
      return protocolResponse('00', 'Confirm Success');
    } catch (error) {
      if (error instanceof ProviderObservationNotFoundError)
        return protocolResponse('01', 'Order not found');
      return protocolResponse('99', 'Invalid request');
    }
  }
}
