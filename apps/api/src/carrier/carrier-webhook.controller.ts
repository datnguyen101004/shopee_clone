import { Body, Controller, Headers, HttpCode, Inject, NotFoundException, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { DEMO_CARRIER_MAX_BODY_BYTES, isDemoCarrierCallbackPayload } from '@shopee-clone/contracts';

import { CarrierOperationsService } from './carrier-operations.service';
import { verifyCarrierSignature } from './carrier-signature';

@Controller('carrier/webhooks')
export class CarrierWebhookController {
  constructor(@Inject(CarrierOperationsService) private readonly operations: CarrierOperationsService) {}

  @Post('demo')
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers('x-demo-carrier-timestamp') timestamp?: string,
    @Headers('x-demo-carrier-key-id') keyId?: string,
    @Headers('x-demo-carrier-signature') signature?: string,
    @Headers('content-type') contentType?: string,
  ) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(body ?? {}), 'utf8');
    if (rawBody.length > DEMO_CARRIER_MAX_BODY_BYTES || !contentType?.toLowerCase().startsWith('application/json')) {
      return { outcome: 'REJECTED', detail: 'Invalid callback signature' };
    }
    const secrets = new Map<string, string>();
    const activeKey = process.env.DEMO_CARRIER_HMAC_ACTIVE_KEY_ID ?? 'local-demo-carrier-v1';
    const activeSecret = process.env.DEMO_CARRIER_HMAC_ACTIVE_SECRET;
    if (activeSecret) secrets.set(activeKey, activeSecret);
    const previousSecret = process.env.DEMO_CARRIER_HMAC_PREVIOUS_SECRET;
    const previousKey = process.env.DEMO_CARRIER_HMAC_PREVIOUS_KEY_ID;
    if (previousSecret && previousKey) secrets.set(previousKey, previousSecret);
    const secret = keyId ? secrets.get(keyId) : undefined;
    if (!secret || !verifyCarrierSignature(secret, { timestamp, keyId, signature }, request.method, request.path, rawBody)) {
      return { outcome: 'REJECTED', detail: 'Invalid callback signature' };
    }
    if (!isDemoCarrierCallbackPayload(body)) return { outcome: 'REJECTED', detail: 'Invalid callback payload' };
    return this.operations.reconcileCallback(body, rawBody);
  }
}
